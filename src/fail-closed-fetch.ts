export function fetchWithoutRedirect(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    redirect: "error",
  });
}
