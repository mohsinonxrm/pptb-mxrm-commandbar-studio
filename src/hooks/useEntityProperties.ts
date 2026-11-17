import { useEffect, useState } from "react";
import { fetchEntityProperties } from "@/services/dataverse/entityService";
import { useSessionStore } from "@/store/sessionStore";
import type { EntityProperty } from "@/types/ribbon";

type Properties = Partial<Record<EntityProperty, boolean>>;

/** Read once per connection and entity: they change only with a customization. */
const cache = new Map<string, Promise<Properties>>();

/**
 * The entity's properties that `EntityPropertyRule`s test, for Simulate (#191). Undefined until
 * read, and outside a host (no Dataverse).
 */
export function useEntityProperties(logicalName: string | undefined): Properties | undefined {
	const connection = useSessionStore((s) => s.connectionUrl);
	const key = `${connection ?? ""}|${logicalName ?? ""}`;
	const [read, setRead] = useState<{ key: string; properties: Properties }>();
	useEffect(() => {
		if (!logicalName || !window.dataverseAPI) return;
		let current = true;
		if (!cache.has(key)) cache.set(key, fetchEntityProperties(logicalName));
		void cache.get(key)!.then((properties) => {
			if (current) setRead({ key, properties });
		});
		return () => {
			current = false;
		};
	}, [key, logicalName]);
	return read?.key === key ? read.properties : undefined;
}
