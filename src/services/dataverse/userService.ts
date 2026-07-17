import { useRuntimeLogStore } from "@/store/runtimeLogStore";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

interface WhoAmIResult {
	UserId?: string;
}

interface SystemUserResult {
	fullname?: string;
}

export interface CurrentUserInfo {
	id: string;
	name: string;
}

export async function fetchCurrentUser(): Promise<CurrentUserInfo> {
	const dataverseAPI = getDataverseAPI();
	useRuntimeLogStore.getState().logInfo("dataverse", "Resolving current user via WhoAmI...");
	const who = (await dataverseAPI.execute({
		operationName: "WhoAmI",
		operationType: "function",
	})) as WhoAmIResult;

	const userId = typeof who.UserId === "string" ? who.UserId : "";
	if (!userId) {
		useRuntimeLogStore.getState().logWarn("dataverse", "WhoAmI returned no user id.");
		return { id: "", name: "" };
	}

	// PPTB's retrieve() takes the entity LOGICAL name (singular) and pluralizes
	// internally. Passing the already-plural set name "systemusers" caused PPTB to
	// re-pluralize to "systemuserses", producing a 0x80060888 "resource not found".
	const user = await dataverseAPI.retrieve("systemuser", userId, ["fullname"]);
	const fullname = (user as SystemUserResult).fullname?.trim();
	const resolved = {
		id: userId,
		name: fullname && fullname.length > 0 ? fullname : "Current User",
	};
	useRuntimeLogStore.getState().logInfo("dataverse", `Current user resolved: ${resolved.name}.`);
	return resolved;
}
