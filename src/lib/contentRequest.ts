export function createEncryptedPayloadRequest(baseUrl: string): Request {
  return new Request(`${baseUrl}data.enc`, { cache: "no-store" });
}
