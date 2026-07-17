import React from "react";
import { MessageBar, MessageBarBody, MessageBarActions, Button } from "@fluentui/react-components";

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

interface ErrorBoundaryProps {
	children: React.ReactNode;
	/** Override the default error UI entirely */
	fallback?: React.ReactNode;
	/** Human-readable label for the pane (used in the default error message) */
	label?: string;
}

/**
 * Error boundary for major CBS panes.
 * Catches rendering errors and shows a recovery prompt instead of a blank panel.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("[CBS ErrorBoundary]", this.props.label ?? "panel", error, info);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;

			return (
				<MessageBar intent="error" style={{ margin: 8 }}>
					<MessageBarBody>
						<strong>{this.props.label ?? "Panel"}</strong> encountered an error:{" "}
						{this.state.error?.message ?? "Unknown error"}
					</MessageBarBody>
					<MessageBarActions>
						<Button size="small" onClick={this.handleRetry}>
							Retry
						</Button>
					</MessageBarActions>
				</MessageBar>
			);
		}

		return this.props.children;
	}
}
