import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "./auth";

export async function getCurrentSession() {
	const headers = getRequestHeaders();
	return getAuth().api.getSession({ headers });
}
