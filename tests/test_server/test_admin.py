"""
Tests for the admin panel endpoints: authentication, status, and schedule reload.
"""

import os
import sys
from collections import deque

import pytest
from fastapi.testclient import TestClient

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.join(os.path.dirname(__file__), ".."), "..")),
)

import cheat.server as server
from tests.test_server.test_study_flow import make_slot

PASSWORD = "test-admin-password"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def admin_client(password=PASSWORD):
    """Return a TestClient with the X-Admin-Password header pre-set."""
    client = TestClient(server.app)
    client.headers.update({"X-Admin-Password": password})
    return client


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestAdminAuth:
    def test_no_password_returns_401(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        client = TestClient(server.app)  # no header
        assert client.get("/api/admin/status").status_code == 401

    def test_wrong_password_returns_401(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        client = TestClient(server.app)
        client.headers.update({"X-Admin-Password": "wrong"})
        assert client.get("/api/admin/status").status_code == 401

    def test_correct_password_returns_200(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        assert admin_client().get("/api/admin/status").status_code == 200

    def test_empty_admin_password_returns_403(self, clean_server_state, monkeypatch):
        """If ADMIN_PASSWORD is unset the panel should be disabled entirely."""
        monkeypatch.setattr(server, "ADMIN_PASSWORD", "")
        client = TestClient(server.app)
        client.headers.update({"X-Admin-Password": ""})
        assert client.get("/api/admin/status").status_code == 403

    def test_admin_html_served_without_auth(self, monkeypatch, tmp_path):
        """The HTML page itself requires no password (auth happens in JS)."""
        fake_html = tmp_path / "admin.html"
        fake_html.write_text("<html>admin</html>")
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        # Patch the HTML path
        import cheat.server as sv

        original_file = sv.__file__
        sv.__file__ = str(tmp_path / "server.py")
        try:
            res = TestClient(sv.app).get("/admin")
            assert res.status_code == 200
        finally:
            sv.__file__ = original_file


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------


class TestAdminStatus:
    def test_empty_state_returns_zeroes(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        data = admin_client().get("/api/admin/status").json()
        assert data["schedule"] == []
        assert data["queue"] == []
        assert data["active_games"] == []

    def test_schedule_slots_appear_in_status(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        server.schedule.append(make_slot(num_humans=2))
        server.schedule.append(make_slot(num_humans=3))
        data = admin_client().get("/api/admin/status").json()
        assert len(data["schedule"]) == 2
        assert data["schedule"][0]["num_humans"] == 2
        assert data["schedule"][1]["num_humans"] == 3

    def test_queue_participants_appear_in_status(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        from cheat.player import HumanPlayer

        p = HumanPlayer(id=None, name="Alice", avatar="🎮")
        p.identifier = "abc123"
        server.study_participants.append(p)
        data = admin_client().get("/api/admin/status").json()
        assert len(data["queue"]) == 1
        assert data["queue"][0]["name"] == "Alice"
        assert data["queue"][0]["prolific_id"] == "abc123"


# ---------------------------------------------------------------------------
# Reload endpoint
# ---------------------------------------------------------------------------


class TestAdminReload:
    def test_reload_wrong_password_rejected(self, clean_server_state, monkeypatch):
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        client = TestClient(server.app)
        client.headers.update({"X-Admin-Password": "nope"})
        assert client.post("/api/admin/reload").status_code == 401

    def test_reload_replaces_schedule(self, clean_server_state, monkeypatch, tmp_path):
        """POST /api/admin/reload rebuilds the schedule from experiments.yaml."""
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)

        # Pre-populate schedule with a sentinel slot
        server.schedule.append(make_slot(num_humans=99))
        assert len(server.schedule) == 1

        # Point build_schedule at a minimal experiments.yaml in tmp_path
        yaml_path = tmp_path / "experiments.yaml"
        yaml_path.write_text(
            """
randomize_treatments: false
treatments:
  - game:
      experimental_mode: true
      out_dir: ~
      note: reload_test
      game_id: ~
    players:
      - type: human
        avatar: "\U0001f3ae"
        name: P1
      - type: human
        avatar: "\U0001f3ae"
        name: P2
    num_games: 3
    num_rounds: 1
"""
        )
        import cheat.server as sv

        # Monkeypatch build_schedule to read from tmp_path

        def patched_build():
            import copy

            import yaml

            with open(yaml_path) as f:
                experiments = yaml.safe_load(f)
            slots = []
            for treatment in experiments.get("treatments", []):
                num_humans = sum(
                    1 for p in treatment["players"] if p.get("type") == "human"
                )
                for _ in range(treatment.get("num_games", 1)):
                    slots.append(
                        server.GameSlot(
                            config={
                                "game": {
                                    "experimental_mode": True,
                                    "out_dir": None,
                                    "note": treatment["game"]["note"],
                                    "game_id": None,
                                    "n_rounds": 1,
                                },
                                "experiment": {"predefined_messages": None},
                                "players": copy.deepcopy(treatment["players"]),
                                "show_logs": False,
                                "default_system_prompt": "",
                                "predefined_messages": None,
                                "min_human_players": {2: 2, 3: 2, 4: 3, 5: 3, 6: 3},
                                "max_num_active_games": 50,
                            },
                            num_humans=num_humans,
                            max_waiting_time=10 * 60,
                        )
                    )
            return deque(slots)

        monkeypatch.setattr(sv, "build_schedule", patched_build)

        res = admin_client().post("/api/admin/reload")
        assert res.status_code == 200
        assert "3" in res.json()["message"]
        assert len(server.schedule) == 3
        assert server.schedule[0].config["game"]["note"] == "reload_test"

    def test_reload_does_not_clear_participant_queue(
        self, clean_server_state, monkeypatch
    ):
        """Reloading the schedule must not evict waiting participants."""
        monkeypatch.setattr(server, "ADMIN_PASSWORD", PASSWORD)
        from cheat.player import HumanPlayer

        p = HumanPlayer(id=None, name="Bob", avatar="🎮")
        server.study_participants.append(p)

        # Patch build_schedule to return an empty schedule
        monkeypatch.setattr(server, "build_schedule", lambda: deque())

        admin_client().post("/api/admin/reload")

        assert len(server.study_participants) == 1
        assert server.study_participants[0].name == "Bob"
