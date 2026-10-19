import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { renderStartupError } from "@/startup";

interface RootErrorBoundaryState {
	error: unknown;
}

/**
 * Last-resort boundary around the whole app. Without it, an error React can't
 * contain — e.g. a code chunk the host fails to serve (#89, VS Code extension)
 * — unmounts the tree and leaves a blank tab. Shows the start-up error screen
 * instead, with "Try again".
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
	state: RootErrorBoundaryState = { error: undefined };
	private box = createRef<HTMLDivElement>();

	static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
		return { error: error ?? new Error("Unknown error") };
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		console.error("[CBS RootErrorBoundary]", error, info);
		useRuntimeLogStore
			.getState()
			.logError("app", error instanceof Error ? error.message : String(error));
	}

	componentDidMount() {
		this.componentDidUpdate();
	}

	componentDidUpdate() {
		// Plain DOM, like the start-up error: the React tree is what failed.
		if (this.state.error !== undefined && this.box.current)
			renderStartupError(
				this.box.current,
				this.state.error,
				"Command Bar Studio stopped working",
			);
	}

	render() {
		return this.state.error === undefined ? this.props.children : <div ref={this.box} />;
	}
}
