/**
 * Scaling Sequences of a tab (#66 review). Every MaxSize and Scale step of a
 * tab must have its own Sequence: a new group's MaxSize at Sequence 80 on a
 * tab with `Scale Sequence="80"` made Unified Interface drop EVERY custom
 * control of the table from its command bar, while the import, the publish and
 * RetrieveEntityRibbon all looked fine (verified live). MaxSizes also belong
 * before the first Scale, since scaling is applied in order.
 */

export type ScaleKind = "MaxSize" | "Scale";

/** A MaxSize / Scale step the unmanaged layer writes. */
export interface LayerScaleStep {
	id: string;
	kind: ScaleKind;
	groupId: string;
	sequence: number;
}

export interface ScalingChange {
	tabId: string;
	id: string;
	kind: ScaleKind;
	groupId: string;
	from: number;
	to: number;
}

/**
 * Where a new MaxSize goes: after the last MaxSize that comes before the first
 * Scale, and before that first Scale. A MaxSize placed after the first Scale
 * (e.g. one an earlier CBS version wrote at its group's Sequence) is out of
 * band and ignored here — it doesn't make the band smaller (#66 review M2).
 */
export function maxSizeBand(maxSizes: number[], scales: number[]): { after: number; before: number } {
	const before = scales.length > 0 ? Math.min(...scales) : Infinity;
	const inBand = maxSizes.filter((s) => s < before);
	return { after: inBand.length > 0 ? Math.max(...inBand) : 0, before };
}

/** The first free Sequence in a tab's MaxSize band, or undefined when the band is full. */
export function freeMaxSizeSequence(band: { after: number; before: number }, used: Set<number>): number | undefined {
	let seq = band.after > 0 ? band.after + 1 : band.before > 10 ? 10 : 1;
	while (used.has(seq)) seq++;
	return seq < band.before ? seq : undefined;
}

/**
 * Gives the layer's steps of one tab Sequences that no other step of the tab
 * uses (the platform's — which CBS can't change — or another layer step's),
 * with every layer MaxSize before the tab's first Scale. A step that already
 * has such a Sequence keeps it (the first one wins a tie); the others move: a
 * Scale after the last step, a MaxSize to the first free Sequence of the
 * MaxSize band. A MaxSize that can't be placed is a problem.
 */
export function resequenceLayerScaling(
	tabId: string,
	platform: { maxSizes: number[]; scales: number[] },
	layer: LayerScaleStep[],
): { changes: ScalingChange[]; problems: string[] } {
	const changes: ScalingChange[] = [];
	const problems: string[] = [];
	const used = new Set([...platform.maxSizes, ...platform.scales]);
	const move = (s: LayerScaleStep, to: number) => {
		changes.push({ tabId, id: s.id, kind: s.kind, groupId: s.groupId, from: s.sequence, to });
		used.add(to);
	};

	const scales = layer.filter((s) => s.kind === "Scale");
	const movedScales: LayerScaleStep[] = [];
	for (const s of scales) {
		if (used.has(s.sequence)) movedScales.push(s);
		else used.add(s.sequence);
	}
	for (const s of movedScales) move(s, Math.max(0, ...used) + 1);

	const scaleSeqs = [
		...platform.scales,
		...scales.map((s) => changes.find((c) => c.id === s.id && c.kind === "Scale")?.to ?? s.sequence),
	];
	const band = maxSizeBand(platform.maxSizes, scaleSeqs);
	const misplaced: LayerScaleStep[] = [];
	for (const s of layer.filter((x) => x.kind === "MaxSize")) {
		if (s.sequence < band.before && !used.has(s.sequence)) used.add(s.sequence);
		else misplaced.push(s);
	}
	for (const s of misplaced) {
		const to = freeMaxSizeSequence(band, used);
		if (to === undefined) {
			problems.push(
				`The scaling of tab ${tabId} has no free position for MaxSize ${s.id} (Sequence ${s.sequence}): it must come ` +
					`before the first Scale (${band.before}) and use a Sequence no other step uses`,
			);
		} else move(s, to);
	}
	return { changes, problems };
}

export function describeScalingChange(c: ScalingChange): string {
	return `Repaired the scaling of tab ${c.tabId}: ${c.kind} ${c.id} (group ${c.groupId}) moves from Sequence ${c.from} to ${c.to}, so no two scaling steps share a Sequence`;
}
