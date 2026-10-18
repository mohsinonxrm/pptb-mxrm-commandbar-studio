import { describe, it, expect } from "vitest";
import { sourceForCopy } from "@/utils/copyButton";
import { effectiveModernImage } from "@/services/xmlGenerator";
import type { RibbonButton } from "@/types/ribbon";

const loaded: RibbonButton = {
	id: "rw.contact.Existing.Button",
	label: "Pre-existing (RW)",
	kind: "button",
	sequence: 900,
	templateAlias: "o1",
	commandId: "rw.contact.Existing.Command",
	icon: "info",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	source: {
		labelToken: "$LocLabels:rw.contact.Existing.Button.LabelText",
		modernImage: "Info",
		attributes: {
			LabelText: "$LocLabels:rw.contact.Existing.Button.LabelText",
			ModernImage: "Info",
			Alt: "x",
		},
	},
};

describe("copied buttons keep their icon (#60)", () => {
	it("keeps the loaded ModernImage but none of the LocLabel tokens", () => {
		const src = sourceForCopy(loaded.source);
		expect(src).toEqual({ modernImage: "Info", attributes: { ModernImage: "Info" } });
		const copy: RibbonButton = { ...loaded, id: "rw.contact.Existing.Button_copy_1", source: src };
		expect(effectiveModernImage(copy)).toBe("Info");
	});

	it("a web resource image on the copy wins over the loaded name", () => {
		const copy: RibbonButton = {
			...loaded,
			id: "copy",
			image32: "$webresource:cbstest_/icons/cbs/star.svg",
			source: sourceForCopy(loaded.source),
		};
		expect(effectiveModernImage(copy)).toBe("$webresource:cbstest_/icons/cbs/star.svg");
	});

	it("keeps the loaded image references so the copy publishes the same icon", () => {
		const withImages: RibbonButton = {
			...loaded,
			// what the parser sets for this ModernImage (normalizeModernImage)
			icon: "$webresource:new_/svg/do.svg",
			image16: "$webresource:new_/png/do16.png",
			image32: "$webresource:new_/png/do32.png",
			source: {
				modernImage: "$webresource:new_/svg/Do.svg",
				attributes: {
					ModernImage: "$webresource:new_/svg/Do.svg",
					Image16by16: "$webresource:new_/png/do16.png",
					Image32by32: "$webresource:new_/png/do32.png",
					LabelText: "$LocLabels:x",
				},
			},
		};
		expect(effectiveModernImage(withImages)).toBe("$webresource:new_/svg/Do.svg");
		const copy: RibbonButton = { ...withImages, id: "copy", source: sourceForCopy(withImages.source) };
		expect(copy.source?.attributes.LabelText).toBeUndefined();
		expect(effectiveModernImage(copy)).toBe("$webresource:new_/svg/Do.svg");
	});

	it("a button with no loaded ModernImage gets no source", () => {
		expect(sourceForCopy(undefined)).toBeUndefined();
		expect(sourceForCopy({ attributes: { LabelText: "x" } })).toBeUndefined();
	});
});
