import React, { useEffect, useState } from "react";
import FluentIcon, { hasFluentIcon } from "@/components/shared/FluentIcon";
import { loadWebResourceImage } from "@/services/dataverse/webResourceService";
import { useSessionStore } from "@/store/sessionStore";
import type { RibbonButton } from "@/types/ribbon";

const WEB_RESOURCE = "$webresource:";

/** Images loaded this session, by environment and web resource name. */
const images = new Map<string, Promise<string | null>>();

/** The `$webresource:` image a control names (its 32 px image first), without the prefix. */
function webResourceImageOf(button: RibbonButton): string | undefined {
	const ref = [button.image32, button.image16, button.source?.modernImage].find((v) =>
		v?.startsWith(WEB_RESOURCE),
	);
	return ref?.slice(WEB_RESOURCE.length).trim() || undefined;
}

/**
 * A control's icon on the canvas: its Fluent or out-of-the-box ModernImage
 * icon, else the `$webresource:` image it names, loaded once per session (#6).
 * The placeholder shows while it loads, or when it can't be loaded.
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
	const resource = hasFluentIcon(button.icon) ? undefined : webResourceImageOf(button);
	const key = resource ? `${environment}|${resource}` : "";
	const [loaded, setLoaded] = useState<{ key: string; src: string | null }>({
		key: "",
		src: null,
	});

	useEffect(() => {
		if (!key || !resource) return;
		let current = true;
		if (!images.has(key))
			images.set(
				key,
				loadWebResourceImage(resource).catch(() => null),
			);
		void images.get(key)!.then((src) => {
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
				style={{ objectFit: "contain", ...style }}
			/>
		);
	}
	return <FluentIcon name={button.icon || "apps_add_in"} size={size} style={style} />;
}
