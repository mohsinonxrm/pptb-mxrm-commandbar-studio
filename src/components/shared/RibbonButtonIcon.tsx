import React, { useEffect, useState } from "react";
import FluentIcon from "@/components/shared/FluentIcon";
import { loadWebResourceImage } from "@/services/dataverse/webResourceService";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonButton } from "@/types/ribbon";

const WEB_RESOURCE = "$webresource:";

/**
 * Ribbon images are drawn for a light command bar (dark glyphs such as
 * `#323130`). In the dark theme they're shown with their lightness inverted
 * and their hue kept, so a dark glyph reads light and a blue one stays blue
 * (#229).
 */
const DARK_IMAGE = "invert(1) hue-rotate(180deg)";

/** Images loaded this session, by environment and web resource name. A failed load isn't kept. */
const images = new Map<string, Promise<string | null>>();

/** At most this many image reads at once: a tab can name dozens (#6 review). */
const MAX_LOADS = 6;
let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(load: () => Promise<T>): Promise<T> {
	if (active >= MAX_LOADS) await new Promise<void>((resolve) => waiting.push(resolve));
	active++;
	try {
		return await load();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

function imageFor(key: string, resource: string): Promise<string | null> {
	let image = images.get(key);
	if (!image) {
		image = limited(() => loadWebResourceImage(resource)).catch(() => {
			// A throttled or failed read is tried again the next time the icon shows.
			images.delete(key);
			return null;
		});
		images.set(key, image);
	}
	return image;
}

/** The `$webresource:` image a control names (its 32 px image first), without the prefix. */
function webResourceImageOf(button: RibbonButton): string | undefined {
	const ref = [button.image32, button.image16, button.source?.modernImage].find((v) =>
		v?.startsWith(WEB_RESOURCE),
	);
	return ref?.slice(WEB_RESOURCE.length).trim() || undefined;
}

/**
 * A control's icon on the canvas: the `$webresource:` image it names, loaded
 * once per session (#6) — it's what publishes, so it wins over an icon matched
 * by name (a picked `report.png` isn't the Report icon); else, and while it
 * loads or when it can't be loaded, its Fluent or out-of-the-box ModernImage icon.
 */
export function RibbonButtonIcon({
	button,
	size,
	style,
}: {
	button: RibbonButton;
	size: number;
	style?: React.CSSProperties;
}) {
	const environment = useSessionStore((s) => s.connectionUrl);
	const dark = useUIStore((s) => s.themeMode === "dark");
	const resource = webResourceImageOf(button);
	const key = resource ? `${environment}|${resource}` : "";
	const [loaded, setLoaded] = useState<{ key: string; src: string | null }>({
		key: "",
		src: null,
	});

	useEffect(() => {
		if (!key || !resource) return;
		let current = true;
		void imageFor(key, resource).then((src) => {
			if (current) setLoaded({ key, src });
		});
		return () => {
			current = false;
		};
	}, [key, resource]);

	if (key && loaded.key === key && loaded.src) {
		return (
			<img
				src={loaded.src}
				width={size}
				height={size}
				alt=""
				aria-hidden
				style={{ objectFit: "contain", filter: dark ? DARK_IMAGE : undefined, ...style }}
			/>
		);
	}
	return <FluentIcon name={button.icon || "apps_add_in"} size={size} style={style} />;
}
