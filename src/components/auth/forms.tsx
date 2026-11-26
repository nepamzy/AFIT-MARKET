'use client'
import { OtpCode } from '@/components/ui/otp-code'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Button, ButtonLink } from '@/components/ui/button'
import { SignaturePad } from '@/components/domain/signature-pad'
import { CodeBoxes } from '@/components/domain/code-boxes'
import { Checkbox, Input, Textarea } from '@/components/ui/fields'
import { AutoReadyChoice } from '@/components/domain/auto-ready-choice'
import {
  VendorChoices,
  vendorChoicesReady,
  type CategoryChoice,
  type VendorChoicesState,
} from '@/components/domain/vendor-choices'
import { InterestPicker, MIN_PICKS } from './interest-picker'
import { SignatureStatement } from './signature-statement'
import { RolePhoto } from '@/components/landing/role-photo'
import { Watermark } from '@/components/landing/watermark'
import {
  requestPasswordResetAction,
  confirmEmailCodeAction,
  resendConfirmationAction,
  resetPasswordAction,
  signInAction,
  saveMatricAction,
  signUpAction,
  type FormState,
} from '@/server/modules/identity-and-access/actions'

const initial: FormState = {}

function Notice({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p
        role="alert"
        className="rounded-[var(--radius-control)] bg-danger-50 px-3 py-2 font-medium text-danger-700"
      >
        {state.error}
      </p>
    )
  if (state.message)
    return (
      <p
        role="status"
        className="rounded-[var(--radius-control)] bg-success-50 px-3 py-2 font-medium text-success-700"
      >
        {state.message}
      </p>
    )
  return null
}

/** `staff` is the hidden administrator entrance (/staff-login): it only hides the sign-up link. */
export function SignInForm({ next, staff = false }: { next: string; staff?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initial)
  return (
    <form action={action} className="space-y-4" noValidate>
      <Notice state={state} />
      <input type="hidden" name="next" value={next} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        defaultValue={state.email ?? ''}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <Button type="submit" variant="gold" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm">
        <Link className="font-semibold text-brand-700 underline" href="/forgot-password">
          Forgot your password?
        </Link>
      </p>
      {!staff && (
        <p className="text-center text-sm text-muted">
          New here?{' '}
          <Link className="font-semibold text-brand-700 underline" href="/signup">
            Create an account
          </Link>
        </p>
      )}
    </form>
  )
}

/** After creating an account: type the code from the e-mail. Resend it, go back to sign in, or start again from here. */
function SignUpDone({ email, message }: { email: string; message?: string }) {
  const [resend, resendAction, resending] = useActionState(resendConfirmationAction, initial)
  const [confirm, confirmAction, confirming] = useActionState(confirmEmailCodeAction, initial)
  const [emailCode, setEmailCode] = useState('')
  return (
    <div className="space-y-4" data-testid="signup-done">
      <p className="text-center text-5xl" aria-hidden="true">
        ✉️
      </p>
      <h2 className="text-center text-xl font-bold">Check your email</h2>
      <Notice state={{ message: message ?? `We sent a confirmation code to ${email}.` }} />
      <form action={confirmAction} className="space-y-3" noValidate>
        <input type="hidden" name="email" value={email} />
        {confirm.error && (
          <p role="alert" className="font-medium text-danger-700">
            {confirm.error}
          </p>
        )}
        <OtpCode
          name="code"
          label="Confirmation code"
          value={emailCode}
          onChange={setEmailCode}
          length={8}
          max={8}
          status={confirming ? 'checking' : confirm.ok ? 'ok' : confirm.error ? 'bad' : 'idle'}
          autoFocus
          hint={`Open the message from AFIT Market sent to ${email}, copy the code and paste it here.`}
        />
        <Button
          type="submit"
          variant="gold"
          disabled={confirming || emailCode.length < 8}
          className="w-full"
        >
          {confirming ? 'Checking…' : 'Confirm my email'}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Nothing there after a minute? Look in Spam or Promotions, then ask for a new code.
      </p>
      <form action={resendAction} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        {resend.error && (
          <p role="alert" className="font-medium text-danger-700">
            {resend.error}
          </p>
        )}
        {resend.ok && resend.message && (
          <p role="status" className="font-medium text-success-700">
            {resend.message}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={resending} className="w-full">
          {resending ? 'Sending…' : 'Send me a new code'}
        </Button>
      </form>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          href="/login"
          className="touch-target flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-4 font-bold text-navy-900 hover:bg-brand-50"
        >
          Back to sign in
        </Link>
        <a
          href="/signup"
          className="touch-target flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong px-4 font-bold text-navy-900 hover:bg-brand-50"
        >
          Use a different email
        </a>
      </div>
    </div>
  )
}

type Intent = 'customer' | 'vendor' | 'rider'
type PersonType = 'student' | 'military' | 'lecturer' | 'other'

/** Shrinks a photo to a JPEG small enough to send with the form (about 500 KB at most). */
async function shrinkToJpeg(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const url = c.toDataURL('image/jpeg', q)
      if (url.length < 640_000) return url
    }
    return null
  } catch {
    return null
  }
}

/** The ID card photo as it will be sent (shrunk). There is no QR check: an administrator looks at the card. */
async function readCard(file: File): Promise<{ url: string } | null> {
  const url = await shrinkToJpeg(file)
  return url ? { url } : null
}

/** A Nigerian mobile number as people type it: 0803 123 4567 or +234 803 123 4567. */
const looksLikePhone = (v: string) =>
  /^(?:\+234|234|0)[789][01]\d{8}$/.test(v.replace(/[\s()-]/g, ''))

/** Whole years since a date of birth typed as YYYY-MM-DD (the server checks again). */
const ageOf = (dob: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return 0
  const now = new Date()
  let a = now.getFullYear() - Number(m[1])
  if (
    now.getMonth() + 1 < Number(m[2]) ||
    (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))
  )
    a -= 1
  return a
}

const ROLE_HELP: Record<Intent, [string, string]> = {
  customer: ['Customer', 'Buy food and items and get them delivered or ready for pickup.'],
  vendor: [
    'Vendor',
    'Sell items. You apply with your shop details and are approved before you can sell.',
  ],
  rider: ['Rider', 'Deliver orders. You apply and are approved before you can deliver.'],
}
const TYPE_LABEL: Record<PersonType, string> = {
  student: 'Student',
  military: 'Military',
  lecturer: 'Lecturer',
  other: 'Other',
}

/** Small flat badges for the "I am a" choices. Decorative: the words beside them carry the meaning. */
function PersonIcon({ kind }: { kind: PersonType }) {
  const common = {
    viewBox: '0 0 48 48',
    className: 'size-10',
    'aria-hidden': true,
    focusable: false,
  } as const
  if (kind === 'student')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="22" className="fill-gold-400/30" />
        <path d="M24 12 6 21l18 9 18-9z" className="fill-navy-900" />
        <path d="M13 26v8c0 3 5 6 11 6s11-3 11-6v-8l-11 5z" className="fill-brand-700" />
        <path d="M40 22v12" stroke="rgb(255 201 40)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  if (kind === 'military')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="22" className="fill-brand-50" />
        <path d="M24 7 38 12v11c0 8-6 14-14 18C16 37 10 31 10 23V12z" className="fill-navy-900" />
        <path
          d="m24 15 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"
          className="fill-gold-400"
        />
      </svg>
    )
  if (kind === 'lecturer')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="22" className="fill-gold-400/30" />
        <rect x="8" y="10" width="32" height="20" rx="3" className="fill-navy-900" />
        <path
          d="M14 17h14M14 22h20M14 26h9"
          stroke="rgb(255 255 255)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M18 40 24 30l6 10" stroke="rgb(11 42 92)" strokeWidth="3" fill="none" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="24" cy="24" r="22" className="fill-brand-50" />
      <circle cx="24" cy="18" r="7" className="fill-navy-900" />
      <path d="M10 40c1-9 7-13 14-13s13 4 14 13z" className="fill-brand-700" />
    </svg>
  )
}

/**
 * A shop owner who opens their used invitation link before confirming the email: ask for the address they signed up with, then show
 * the code screen again (the code can be resent).
 */
export function ResumeConfirmEmail({ hint }: { hint: string }) {
  const [email, setEmail] = useState('')
  const [go, setGo] = useState(false)
  if (go) return <SignUpDone email={email.trim().toLowerCase()} />
  return (
    <div className="space-y-3">
      <Input
        label="The email you signed up with"
        name="resumeEmail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint={`It looks like ${hint}.`}
      />
      <Button
        type="button"
        variant="gold"
        disabled={!email.includes('@')}
        onClick={() => setGo(true)}
      >
        Continue
      </Button>
    </div>
  )
}

export function SignUpForm({
  categories = [],
  invite = '',
  vendorInviteOnly = false,
}: {
  categories?: CategoryChoice[]
  /** A valid personal invitation link token (shop sign-up). */
  invite?: string
  vendorInviteOnly?: boolean
}) {
  const [state, action, pending] = useActionState(signUpAction, initial)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [intent, setIntent] = useState<Intent>(invite ? 'vendor' : 'customer')
  const [personType, setPersonType] = useState<PersonType | null>(null)
  const [studentId, setStudentId] = useState('')
  const [idCard, setIdCard] = useState<string | null>(null)
  const [idBack, setIdBack] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [vendor, setVendor] = useState<VendorChoicesState>({
    vendorType: '',
    categories: [],
    other: '',
    place: '',
  })
  const [signed, setSigned] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [vendorCode, setVendorCode] = useState('')
  // a shop owner applies while signing up: the shop details
  const [shopName, setShopName] = useState('')
  const [shopAbout, setShopAbout] = useState('')
  const [shopPickup, setShopPickup] = useState('')
  const [shopFee, setShopFee] = useState('500')
  const [shopAgree, setShopAgree] = useState(false)
  const interestCategories = categories.filter((c) => c.slug !== 'other')
  if (state.ok) return <SignUpDone email={state.email ?? ''} message={state.message} />

  const isRider = intent === 'rider'
  const isVendor = intent === 'vendor'
  const isStudent =
    (intent === 'customer' && personType === 'student') ||
    (isVendor && vendor.vendorType === 'student')
  // riders and student shop owners must add the front and the back of the ID card
  const needsFullId = isRider || (isVendor && vendor.vendorType === 'student')
  const riderReady = studentId.trim().length >= 3 && !!idCard && !!idBack
  const step1Ready = isRider
    ? riderReady
    : isVendor
      ? vendorChoicesReady(vendor, categories) && (vendor.vendorType !== 'student' || riderReady)
      : intent !== 'customer' ||
        (personType !== null && (personType !== 'student' || studentId.trim().length >= 3))
  const noInvite = isVendor && vendorInviteOnly && !invite
  const goNext = () => {
    setProblem(null)
    if (step === 1) {
      if (noInvite)
        return setProblem(
          'Shop sign-up is by invitation during our beta. Open your personal invitation link, or ask AFIT Market for one.',
        )
      if (isVendor) {
        if (!vendor.vendorType)
          return setProblem(
            'Choose whether you are a student, a shop AFIT already knows, or other.',
          )
        if (vendor.categories.length === 0) return setProblem('Choose what your shop will sell.')
        if (!vendorChoicesReady(vendor, categories))
          return setProblem(
            vendor.vendorType === 'afit_shop' && vendor.place.trim().length < 3
              ? 'Say where your shop is on campus.'
              : 'Tell us what else your shop will sell.',
          )
      }
      if (intent === 'customer' && !personType)
        return setProblem('Choose whether you are a student, military, a lecturer or other.')
      if (isStudent && studentId.trim().length < 3) return setProblem('Enter your matric number.')
      if (needsFullId) {
        if (studentId.trim().length < 3) return setProblem('Enter your matric number.')
        if (!idCard) return setProblem('Add a clear photo of the front of your ID card.')
        if (!idBack) return setProblem('Add a clear photo of the back of your ID card.')
      }
      return setStep(2)
    }
    if (step === 2) {
      if (fullName.trim().length < 2) return setProblem('Enter your full name.')
      if (!looksLikePhone(phone))
        return setProblem('Enter a valid Nigerian phone number, for example 0803 123 4567.')
      if (!dob) return setProblem('Enter your date of birth.')
      if (ageOf(dob) < 18) return setProblem('AFIT Market is only for people aged 18 and over.')
      // customers pick what they would like to shop; shops give their shop details; riders go straight on
      return setStep(intent === 'rider' ? 4 : 3)
    }
    if (step === 3 && isVendor) {
      if (shopName.trim().length < 2) return setProblem('Enter your shop name.')
      if (shopAbout.trim().length < 10)
        return setProblem('Tell us what you sell (at least 10 characters).')
      if (shopPickup.trim().length < 3)
        return setProblem('Say where customers will collect their orders.')
      if (!/^[0-9]{1,3}(\.[0-9]{1,2})?$/.test(shopFee.trim()) || Number(shopFee) > 500)
        return setProblem('Your delivery fee must be from 0 to 500 naira.')
      if (!shopAgree) return setProblem('Please tick the box to agree to the vendor rules.')
      return setStep(4)
    }
    if (step === 3) {
      if (interests.length < MIN_PICKS)
        return setProblem(`Pick at least ${MIN_PICKS} things you would like to shop.`)
      return setStep(4)
    }
    if (step === 4) {
      if (!signed) return setProblem('Please sign in the box first.')
      return setStep(5)
    }
  }
  const wantsInterests = intent !== 'rider'
  const titles = [
    'Who are you?',
    'About you',
    isVendor ? 'Your shop' : 'What would you like to shop?',
    'Your signature',
    'Your account',
  ]
  const stepTitle = titles[step - 1]!
  const stepNo = wantsInterests || step < 3 ? step : step - 1
  const stepCount = wantsInterests ? 5 : 4

  return (
    <form action={action} className="space-y-4" noValidate>
      <Notice state={state} />
      <p className="text-sm font-semibold text-muted" data-testid="signup-step">
        Step {stepNo} of {stepCount}: {stepTitle}
      </p>
      {problem && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] bg-danger-50 px-3 py-2 font-medium text-danger-700"
        >
          {problem}
        </p>
      )}
      <input type="hidden" name="intent" value={intent} />
      {invite && <input type="hidden" name="invite" value={invite} />}
      {intent === 'customer' && personType && (
        <input type="hidden" name="personType" value={personType} />
      )}
      {(isStudent || isRider) && <input type="hidden" name="studentId" value={studentId} />}
      {(isStudent || isRider) && idCard && <input type="hidden" name="idCard" value={idCard} />}
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="interests" value={JSON.stringify(interests)} />
      {needsFullId && idBack && <input type="hidden" name="idCardBack" value={idBack} />}
      {isVendor && vendor.vendorType === 'student' && (
        <input type="hidden" name="personType" value="student" />
      )}

      <div className={step === 1 ? 'space-y-4' : 'hidden'}>
        <fieldset className="relative isolate overflow-hidden rounded-[var(--radius-control)] border border-line bg-accent-50/60 p-3">
          <Watermark />
          <legend className="relative z-10 px-1 text-sm font-bold text-navy-900">
            I want to use AFIT Market as a
          </legend>
          <div className="relative z-10 grid gap-2 sm:grid-cols-3">
            {(Object.keys(ROLE_HELP) as Intent[]).map((value) => {
              return (
                <label
                  key={value}
                  className="touch-target group relative flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border-2 border-line bg-white p-3 transition hover:-translate-y-0.5 hover:border-brand-600 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:checked]:shadow-[var(--shadow-card)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold-400/60 sm:flex-col sm:text-center"
                >
                  <input
                    type="radio"
                    name="intent-choice"
                    value={value}
                    checked={intent === value}
                    onChange={() => {
                      setIntent(value)
                      setProblem(null)
                    }}
                    className="absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
                  />
                  <RolePhoto
                    kind={value}
                    className="size-20 shrink-0 transition-transform duration-300 group-hover:scale-105 group-has-[:checked]:scale-105 sm:size-28"
                  />
                  <span>
                    <span className="block font-bold text-navy-900">{ROLE_HELP[value][0]}</span>
                    <span className="block text-sm text-muted">{ROLE_HELP[value][1]}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 hidden size-6 place-items-center rounded-full bg-brand-700 text-xs font-extrabold text-white group-has-[:checked]:grid"
                  >
                    ✓
                  </span>
                </label>
              )
            })}
          </div>
          <p className="relative z-10 mt-2 text-xs text-muted">
            Choosing Rider takes you to the rider application after you sign in. A shop applies
            right here while it creates its account. Nothing is switched on until it is approved.
          </p>
          {noInvite && (
            <p
              role="status"
              className="relative z-10 mt-2 rounded-[var(--radius-control)] bg-gold-100 px-3 py-2 text-sm font-semibold text-navy-900"
            >
              Shop sign-up is by invitation during our beta. Use your personal invitation link, or
              ask AFIT Market for one.
            </p>
          )}
        </fieldset>

        {intent === 'customer' && (
          <fieldset className="rounded-[var(--radius-control)] border border-line p-3">
            <legend className="px-1 text-sm font-bold text-navy-900">I am a</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TYPE_LABEL) as PersonType[]).map((t) => (
                <label
                  key={t}
                  className="touch-target relative flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-control)] border-2 border-line bg-white px-2 py-3 text-center transition hover:border-brand-600 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold-400/60"
                >
                  <input
                    type="radio"
                    name="person-choice"
                    value={t}
                    checked={personType === t}
                    onChange={() => {
                      setPersonType(t)
                      setProblem(null)
                    }}
                    className="absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
                  />
                  <PersonIcon kind={t} />
                  <span className="font-semibold">{TYPE_LABEL[t]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {isVendor && (
          <VendorChoices
            categories={categories}
            onChange={(v) => {
              setVendor(v)
              setProblem(null)
            }}
          />
        )}

        {isStudent && !needsFullId && (
          <div className="space-y-3 rounded-[var(--radius-control)] border border-line p-3">
            <Input
              label="Matric number"
              name="studentIdInput"
              autoComplete="off"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <div className="space-y-1">
              <label htmlFor="idcard-file" className="text-sm font-semibold">
                Photo of your student ID card (optional)
              </label>
              <input
                id="idcard-file"
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  const url = f ? await shrinkToJpeg(f) : null
                  setIdCard(url)
                  if (f && !url) setProblem('That photo could not be used. Try another one.')
                }}
              />
              <p className="text-xs text-muted">
                You can skip this now. You can add your matric number or card later under Security
                in your account.
              </p>
            </div>
          </div>
        )}
        {needsFullId && (
          <div className="space-y-3 rounded-[var(--radius-control)] border border-line p-3">
            <p className="font-semibold text-navy-900">
              {isRider ? 'Rider details' : 'Student shop owner details'}
            </p>
            <Input
              label="Matric number"
              name="riderMatricInput"
              autoComplete="off"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <div className="space-y-1">
              <label htmlFor="rider-id-front" className="text-sm font-semibold">
                Photo of the FRONT of your new student ID card
              </label>
              <input
                id="rider-id-front"
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  setProblem(null)
                  setIdCard(null)
                  if (!f) return
                  const r = await readCard(f)
                  if (!r) return setProblem('That photo could not be used. Try another one.')
                  setIdCard(r.url)
                }}
              />
              <p className="text-xs text-muted">
                Take it flat, in good light, with all four corners showing.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="rider-id-back" className="text-sm font-semibold">
                Photo of the BACK of your ID card
              </label>
              <input
                id="rider-id-back"
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  setProblem(null)
                  setIdBack(null)
                  if (!f) return
                  const url = await shrinkToJpeg(f)
                  if (!url) return setProblem('That photo could not be used. Try another one.')
                  setIdBack(url)
                }}
              />
              {idBack && (
                <p role="status" className="text-sm font-medium text-success-700">
                  Back of the card added.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <ButtonLink href="/" variant="secondary" data-testid="signup-back-home">
            Back
          </ButtonLink>
          <Button type="button" onClick={goNext} disabled={!step1Ready} className="flex-1">
            Next
          </Button>
        </div>
      </div>

      <div className={step === 2 ? 'space-y-4' : 'hidden'}>
        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          hint="As it is on your ID."
        />
        <Input
          label="Phone number"
          name="phoneInput"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint="For example 0803 123 4567. Riders and shops may call you about an order."
        />
        <Input
          label="Date of birth"
          name="dob"
          type="date"
          autoComplete="bday"
          value={dob}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDob(e.target.value)}
          hint="We only use this to make sure you are 18 or older."
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(1)}>
            Back
          </Button>
          <Button type="button" onClick={goNext} className="flex-1">
            Next
          </Button>
        </div>
      </div>

      {isVendor && (
        <div className={step === 3 ? 'space-y-4' : 'hidden'}>
          <Input
            label="Business name"
            name="businessName"
            maxLength={80}
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
          <Textarea
            label="What do you sell?"
            name="description"
            maxLength={500}
            value={shopAbout}
            onChange={(e) => setShopAbout(e.target.value)}
          />
          <Input
            label="Your delivery fee (₦)"
            name="deliveryFee"
            inputMode="numeric"
            value={shopFee}
            onChange={(e) => setShopFee(e.target.value)}
            hint="What you charge for one delivery. The most allowed is ₦500. You can lower it later."
          />
          <Input
            label="Where will customers collect orders?"
            name="pickup"
            maxLength={200}
            value={shopPickup}
            onChange={(e) => setShopPickup(e.target.value)}
            hint="Describe the pickup spot in words. Do not enter coordinates."
          />
          <AutoReadyChoice />
          <p
            id="commission-terms"
            className="rounded-[var(--radius-control)] bg-brand-50 px-3 py-2 text-sm"
          >
            <strong>Commission:</strong> AFIT Market keeps 5% of the total of each completed order
            (items after any product discount, plus the delivery fee when delivery is chosen). You
            can see every order&apos;s commission on your Earnings page. Add your bank account
            there: Paystack splits your share of every sale to it.
          </p>
          <Checkbox
            label="I agree to follow AFIT Market vendor rules, to keep my menu and prices accurate, and to the 5% commission described above."
            name="accept"
            aria-describedby="commission-terms"
            checked={shopAgree}
            onChange={(e) => setShopAgree(e.target.checked)}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={goNext} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      )}
      <div className={step === 3 && !isVendor ? 'space-y-4' : 'hidden'}>
        <InterestPicker
          categories={interestCategories}
          picked={interests}
          onChange={setInterests}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(2)}>
            Back
          </Button>
          <Button
            type="button"
            onClick={goNext}
            disabled={interests.length < MIN_PICKS}
            className="flex-1"
          >
            Next
          </Button>
        </div>
      </div>

      {/* The signature box stays on the page (hidden) so a drawn signature is not lost when moving between steps. */}
      <div className={step === 4 ? 'space-y-4' : 'hidden'}>
        <SignatureStatement />
        <SignaturePad
          label="Sign here"
          hint="Sign with your finger or a stylus."
          onSignedChange={setSigned}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(wantsInterests ? 3 : 2)}>
            Back
          </Button>
          <Button type="button" onClick={goNext} disabled={!signed} className="flex-1">
            Next
          </Button>
        </div>
      </div>

      <div className={step === 5 ? 'space-y-4' : 'hidden'}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters with a lowercase letter, an uppercase letter and a number."
        />
        <Input
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
        {isRider && (
          <div
            className="space-y-2 rounded-[var(--radius-control)] border-2 border-gold-400 p-3"
            data-testid="vendor-code"
          >
            <CodeBoxes
              value={vendorCode}
              onChange={setVendorCode}
              label="Enter your shop's rider code"
              idPrefix="vendor-code"
              length={6}
            />
            <p className="text-sm text-muted">
              Every rider works for one shop. Ask the shop for a rider code: it has 6 digits, works
              once and lasts 10 minutes. It links you to that shop.
            </p>
            <input type="hidden" name="vendorCode" value={vendorCode} />
          </div>
        )}
        <Checkbox name="adult" label="I confirm that I am 18 years old or older." required />
        <p className="text-sm text-muted">
          AFIT Market is only for people aged 18 and over. We use the date of birth you gave to
          check this, and keep your confirmation. By creating an account you agree to the{' '}
          <Link href="/legal/terms" className="underline">
            terms
          </Link>{' '}
          and the{' '}
          <Link href="/legal/privacy" className="underline">
            privacy notice
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setStep(4)}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={pending || (isRider && vendorCode.length < 6)}
            className="flex-1"
          >
            {pending
              ? isVendor
                ? 'Sending your application…'
                : 'Creating account…'
              : isVendor
                ? 'Apply and create my account'
                : 'Create account'}
          </Button>
        </div>
        <p className="text-center text-sm text-muted">
          An authenticator app for extra security is optional. You can add one later from Account,
          then Security.
        </p>
      </div>
      <p className="text-center text-sm text-muted">
        Already registered?{' '}
        <Link className="font-semibold text-brand-700 underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial)
  return (
    <form action={action} className="space-y-4" noValidate>
      <Notice state={state} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email ?? ''}
        hint="We will send a 6-digit code to the email you used to open your account."
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Send me a code'}
      </Button>
    </form>
  )
}

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial)
  const [resetCode, setResetCode] = useState('')
  return (
    <form action={action} className="space-y-4" noValidate>
      <Notice state={state} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email ?? email}
      />
      <OtpCode
        name="code"
        label="6-digit code"
        value={resetCode}
        onChange={setResetCode}
        length={6}
        status={pending ? 'checking' : state.error ? 'bad' : 'idle'}
      />
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters with upper case, lower case and a number."
      />
      <Input
        label="Repeat new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving…' : 'Save password and sign in'}
      </Button>
      <p className="text-center text-sm text-muted">
        No code?{' '}
        <Link className="font-semibold text-brand-700 underline" href="/forgot-password">
          Send a new one
        </Link>
      </p>
    </form>
  )
}

/** Security page: add or change the matric number. */
export function MatricForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(saveMatricAction, initial)
  return (
    <form action={action} className="space-y-3" noValidate>
      <Notice state={state} />
      <Input
        label="Matric number"
        name="matric"
        autoComplete="off"
        defaultValue={current ?? ''}
        hint="Students: your matriculation number. Only you and AFIT Market staff can see it."
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save matric number'}
      </Button>
    </form>
  )
}
