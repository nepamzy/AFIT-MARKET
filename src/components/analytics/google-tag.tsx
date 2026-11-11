import Script from 'next/script'
import { headers } from 'next/headers'
import { googleTagId } from '@/lib/google-tag'

/** The Google tag (Analytics). Renders nothing until GOOGLE_TAG_ID is set to a valid id such as G-XXXXXXXXXX. */
export async function GoogleTag() {
  const id = googleTagId()
  if (!id) return null
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      <Script id="google-tag-init" strategy="afterInteractive" nonce={nonce}>
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});`}
      </Script>
    </>
  )
}
