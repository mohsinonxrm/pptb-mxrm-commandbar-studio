/**
 * The target of a write, shown at the top of its confirmation (#121): the environment (name,
 * type, URL, with Production highlighted) and what is written. On a Production connection it
 * asks for a word to be typed before the action can run. Same block as FetchXML Studio's.
 *
 * The connection is read from the host when the block appears (getPrimaryConnection), so it
 * names the environment the requests will actually go to, and again when its details change
 * while the block is open (e.g. its type is set to Production).
 */
import { useEffect, useState, type ReactNode } from "react";
import {
	Badge,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	MessageBarTitle,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { getPrimaryConnection, type HostConnection } from "@/services/hostConnection";
import { useSessionStore } from "@/store/sessionStore";
import {
	isProductionEnvironment,
	isTypedConfirmation,
	requiresTypedConfirmation,
} from "./targetScopeRules";

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
	box: {
		display: "grid",
		gridTemplateColumns: "auto 1fr",
		columnGap: tokens.spacingHorizontalM,
		rowGap: tokens.spacingVerticalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
	},
	label: { color: tokens.colorNeutralForeground3 },
	value: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
	secondary: { color: tokens.colorNeutralForeground3, wordBreak: "break-all" },
});

export interface TargetScopeRow {
	label: string;
	value: ReactNode;
}

export interface TargetScopeProps {
	/** What is written, one row each (solution, tables, what the write does …). */
	rows: TargetScopeRow[];
	/** The word to type on a Production connection (e.g. the table's logical name). */
	confirmWord: string;
	/**
	 * Called with whether the action may run (false while the connection is read, and on
	 * Production until the word is typed) and the environment type that was read.
	 */
	onConfirmationChange: (confirmed: boolean, environment: string | undefined) => void;
	disabled?: boolean;
}

type ConnectionState =
	{ status: "loading" } | { status: "ready"; connection: HostConnection | null };

export function TargetScope({
	rows,
	confirmWord,
	onConfirmationChange,
	disabled,
}: TargetScopeProps) {
	const styles = useStyles();
	const [state, setState] = useState<ConnectionState>({ status: "loading" });
	const [typed, setTyped] = useState("");
	// The session follows the host's connection (#120): any change re-reads it.
	const sessionEnvironment = useSessionStore((s) => s.environment);
	const sessionUrl = useSessionStore((s) => s.connectionUrl);
	const connectionVersion = useSessionStore((s) => s.connectionVersion);

	useEffect(() => {
		let current = true;
		setState({ status: "loading" });
		getPrimaryConnection()
			.then((connection) => current && setState({ status: "ready", connection }))
			.catch(() => current && setState({ status: "ready", connection: null }));
		return () => {
			current = false;
		};
	}, [sessionEnvironment, sessionUrl, connectionVersion]);

	const connection = state.status === "ready" ? state.connection : null;
	const isProduction = isProductionEnvironment(connection?.environment);
	const askToType =
		state.status === "ready" && requiresTypedConfirmation(connection?.environment);
	const confirmed =
		state.status === "ready" && (!askToType || isTypedConfirmation(typed, confirmWord));

	const readEnvironment = connection?.environment;
	useEffect(() => {
		onConfirmationChange(confirmed, readEnvironment);
	}, [confirmed, readEnvironment, onConfirmationChange]);

	return (
		<div className={styles.root}>
			{isProduction && (
				<MessageBar intent="warning">
					<MessageBarBody>
						<MessageBarTitle>Production environment</MessageBarTitle>
						This changes the live environment.
					</MessageBarBody>
				</MessageBar>
			)}
			<div className={styles.box}>
				<Text className={styles.label}>Environment</Text>
				<div className={styles.value}>
					{state.status === "loading" ? (
						<Text>Reading the connection…</Text>
					) : connection ? (
						<>
							<Text weight="semibold">{connection.name}</Text>
							{connection.environment && (
								<Badge
									size="medium"
									appearance={isProduction ? "filled" : "tint"}
									color={isProduction ? "warning" : "informative"}
								>
									{connection.environment}
								</Badge>
							)}
							<Text size={200} className={styles.secondary}>
								{connection.url}
							</Text>
						</>
					) : (
						<Text>Unknown (the tool has no connection)</Text>
					)}
				</div>
				{rows.map((row) => (
					<div key={row.label} style={{ display: "contents" }}>
						<Text className={styles.label}>{row.label}</Text>
						<div className={styles.value}>{row.value}</div>
					</div>
				))}
			</div>
			{askToType && (
				<Field
					label={
						<>
							Type <strong>{confirmWord}</strong> to confirm
						</>
					}
					hint="Required on a Production environment."
				>
					<Input
						value={typed}
						onChange={(_, data) => setTyped(data.value)}
						disabled={disabled}
						autoComplete="off"
						aria-label={`Type ${confirmWord} to confirm`}
					/>
				</Field>
			)}
		</div>
	);
}
