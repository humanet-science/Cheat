import logging
import colorlog
import os


def setup_logging():
    """Set up colored logging for the application"""

    # Main formatter for SERVER and WEBSOCKET (important messages)
    main_formatter = colorlog.ColoredFormatter(
        '%(log_color)s%(asctime)s  %(name)-10s %(levelname)-10s            %(message)s%(reset)s',
        datefmt='%H:%M:%S',
        log_colors={
            'DEBUG': 'cyan',
            'INFO': 'green',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'red,bg_white',
        },
        secondary_log_colors={},
        style='%'
    )

    # Create handlers
    main_handler = colorlog.StreamHandler()
    main_handler.setFormatter(main_formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Set up specific loggers
    server_logger = logging.getLogger('SERVER')
    server_logger.setLevel(logging.INFO)
    server_logger.addHandler(main_handler)
    server_logger.propagate = False

    ws_logger = logging.getLogger('WEBSOCKET')
    ws_logger.setLevel(logging.INFO)
    ws_logger.addHandler(main_handler)
    ws_logger.propagate = False

    return {
        'server': server_logger,
        'websocket': ws_logger,
    }


def setup_game_logger(game_id: str, out_dir: str):
    """Create a separate logger for each game"""

    logger = logging.getLogger(f'GAME.{game_id}')
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # File handler for detailed logs
    log_file = os.path.join(out_dir, 'game.log')
    file_handler = logging.FileHandler(log_file)
    file_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # Console handler with short game ID (light grey, more indented)
    console_handler = colorlog.StreamHandler()
    short_id = game_id[:8]
    console_formatter = colorlog.ColoredFormatter(
        f'%(light_black)s%(asctime)s  GAME       %(levelname)-8s  [{short_id}]  %(message)s%(reset)s',
        datefmt='%H:%M:%S',
        log_colors={
            'DEBUG': 'light_black',
            'INFO': 'light_black',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'red,bg_white',
        }
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    return logger


def setup_player_logger(game_id: str, out_dir: str):
    """Create a separate logger for player actions in a specific game"""

    logger = logging.getLogger(f'PLAYER.{game_id}')
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # File handler for detailed logs (same file as game logs)
    log_file = os.path.join(out_dir, 'game.log')
    file_handler = logging.FileHandler(log_file)
    file_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] [PLAYER] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # Console handler with short game ID (white/lighter, even more indented)
    console_handler = colorlog.StreamHandler()
    short_id = game_id[:8]
    console_formatter = colorlog.ColoredFormatter(
        f'%(white)s%(asctime)s  PLAYER     %(levelname)-8s  [{short_id}]  %(message)s%(reset)s',
        datefmt='%H:%M:%S',
        log_colors={
            'DEBUG': 'white',
            'INFO': 'white',
            'WARNING': 'yellow',
            'ERROR': 'red',
            'CRITICAL': 'red,bg_white',
        }
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    return logger