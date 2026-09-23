import { next } from '@vercel/functions'

// Everything except the icons/logo needed to render the code page itself.
export const config = {
  matcher: ['/((?!favicon|apple-touch-icon|icon-|manifest\\.webmanifest|Logo\\.jpeg).*)'],
}

const COOKIE_NAME = 'hws_access'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90
const VERIFY_PATH = '/__access'

async function accessToken(code) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('hebrew-with-smadar-access'))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  const match = header.split(/;\s*/).find((part) => part.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : ''
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function codePage(nextPath, error) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Hebrew with Smadar</title>
<link rel="icon" href="/favicon.ico" sizes="any" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #f7f3ed; color: #1f2d3d; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  form { width: 100%; max-width: 340px; background: #fffefa; border: 1px solid #e9e5df; border-radius: 14px; padding: 28px 24px; text-align: center; box-shadow: 0 10px 30px rgba(31, 45, 61, .06); }
  img { width: 84px; height: 84px; object-fit: contain; margin-bottom: 8px; }
  h1 { margin: 0 0 6px; font-size: 22px; color: #1d3b5a; }
  p { margin: 0 0 20px; color: #7b8580; font-size: 14px; }
  input { width: 100%; padding: 12px; font-size: 26px; letter-spacing: .4em; text-align: center; border: 1px solid #dce5e1; border-radius: 10px; background: white; }
  input:focus { outline: 2px solid #2a9d8f; border-color: #2a9d8f; }
  button { width: 100%; margin-top: 14px; padding: 12px; border: 0; border-radius: 10px; background: #2a9d8f; color: white; font-size: 16px; font-weight: 700; cursor: pointer; }
  .error { color: #c0392b; margin: 12px 0 0; font-size: 13px; }
</style>
</head>
<body>
<form method="POST" action="${VERIFY_PATH}">
  <img src="/Logo.jpeg" alt="" />
  <h1>Hebrew with Smadar</h1>
  <p>Enter the 6-digit access code</p>
  <input name="code" type="password" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required autofocus />
  <input type="hidden" name="next" value="${nextPath.replace(/[&"<>]/g, '')}" />
  <button type="submit">Enter</button>
  ${error ? '<p class="error">Wrong code, please try again.</p>' : ''}
</form>
</body>
</html>`
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export default async function middleware(request) {
  const accessCode = process.env.MYTRIP_ACCESS_CODE
  if (!accessCode) return new Response('Access code is not configured.', { status: 503 })

  const url = new URL(request.url)
  const expected = await accessToken(accessCode)

  if (url.pathname === VERIFY_PATH && request.method === 'POST') {
    const form = await request.formData()
    const nextPath = safeNext(form.get('next'))
    const submitted = String(form.get('code') || '').trim()

    if ((await accessToken(submitted)) !== expected) {
      // Slow down guessing.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return codePage(nextPath, true)
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: nextPath,
        'set-cookie': `${COOKIE_NAME}=${expected}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      },
    })
  }

  if (readCookie(request, COOKIE_NAME) === expected) return next()

  return codePage(url.pathname + url.search, false)
}
