/**
 * Whether an icon image is a dark glyph, judged by the average lightness of
 * its visible pixels. Ribbon images are drawn for a light command bar: a dark
 * glyph (`#323130`, a grey 16 px PNG) all but disappears on the dark theme,
 * while a coloured or light icon (Power BI's yellow) reads as it is (#229).
 */

export type ImageTone = "dark" | "light";

/** Below this average lightness (0–1, sRGB-weighted), an image is a dark glyph. */
const DARK_BELOW = 0.35;
/** The image is scaled to this many pixels a side to be measured. */
const SAMPLE = 24;

const tones = new Map<string, Promise<ImageTone>>();

function measure(src: string): Promise<ImageTone> {
	return new Promise((resolve) => {
		const image = new Image();
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = SAMPLE;
				canvas.height = SAMPLE;
				const context = canvas.getContext("2d");
				if (!context) return resolve("light");
				context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
				const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
				let lightness = 0;
				let weight = 0;
				for (let i = 0; i < data.length; i += 4) {
					const alpha = data[i + 3] / 255;
					if (alpha < 0.5) continue;
					lightness +=
						alpha * (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
					weight += alpha * 255;
				}
				resolve(weight > 0 && lightness / weight < DARK_BELOW ? "dark" : "light");
			} catch {
				// A tainted or unreadable image is shown as it is.
				resolve("light");
			}
		};
		image.onerror = () => resolve("light");
		image.src = src;
	});
}

/** The tone of an image (a data URL), measured once per image. */
export function imageTone(src: string): Promise<ImageTone> {
	let tone = tones.get(src);
	if (!tone) {
		tone = measure(src);
		tones.set(src, tone);
	}
	return tone;
}
