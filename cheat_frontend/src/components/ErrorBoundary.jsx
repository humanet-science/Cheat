import React from "react";
import {flush, report} from "../utils/clientLogger";

/**
 * Catches errors thrown while rendering. Without it, a render error unmounts the whole app and the
 * player is left with a blank page. Reports the crash and offers a reload, which rejoins a running game.
 */
export default class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = {hasError: false};
	}

	static getDerivedStateFromError() {
		return {hasError: true};
	}

	componentDidCatch(error, info) {
		report("render_error", {
			message: String(error?.message ?? error),
			stack: error?.stack ?? null,
			component_stack: info?.componentStack ?? null,
		}, {withRecent: true});
		flush();
	}

	render() {
		if (!this.state.hasError) return this.props.children;
		return (
			<div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-green-900 to-blue-900">
				<div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md text-center">
					<div className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</div>
					<div className="text-lg text-gray-600 mb-6">
						Please reload the page. If you were in a game, you will rejoin it where you left off.
					</div>
					<button
						onClick={() => window.location.reload()}
						className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl text-lg"
					>
						Reload
					</button>
				</div>
			</div>
		);
	}
}
