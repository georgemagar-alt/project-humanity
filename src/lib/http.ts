export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function fail(code: string, status = 400): Response {
  return json({ error: code }, status);
}
