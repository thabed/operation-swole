export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request, env),
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/api/coach') {
      return jsonResponse({ error: 'Not found' }, 404, request, env);
    }

    const apiKey = request.headers.get('x-user-api-key') || env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonResponse({
        error: 'AI coach is not configured.',
        detail: 'Set ANTHROPIC_API_KEY in your Cloudflare Worker secrets, or enter your API key in the app.',
      }, 503, request, env);
    }

    const originError = validateOrigin(request, env);
    if (originError) {
      return jsonResponse(originError, 403, request, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body.' }, 400, request, env);
    }

    try {
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      const body = await anthropicResponse.text();
      return new Response(body, {
        status: anthropicResponse.status,
        headers: {
          ...buildCorsHeaders(request, env),
          'content-type': anthropicResponse.headers.get('content-type') || 'application/json; charset=utf-8',
        },
      });
    } catch (error) {
      return jsonResponse({
        error: 'Failed to reach Anthropic API.',
        detail: error.message,
      }, 502, request, env);
    }
  },
};

function jsonResponse(payload, status, request, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...buildCorsHeaders(request, env),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const allowOrigin = allowedOrigins.length === 0
    ? origin || '*'
    : allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-User-Api-Key',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function parseAllowedOrigins(rawValue) {
  return (rawValue || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function validateOrigin(request, env) {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (allowedOrigins.length === 0 || !origin) {
    return null;
  }

  if (allowedOrigins.includes(origin)) {
    return null;
  }

  return {
    error: 'Origin not allowed.',
    detail: `Add ${origin} to ALLOWED_ORIGINS in your Worker settings.`,
  };
}