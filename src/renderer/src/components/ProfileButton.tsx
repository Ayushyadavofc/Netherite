import { useEffect, useState } from 'react'
import { User, X } from 'lucide-react'
import bcrypt from 'bcryptjs'

interface Profile {
  name: string
  gender: 'male' | 'female'
  dob: string
  email: string
  passwordHash: string
}

const STORAGE_KEY = 'netherite-profile'

export default function ProfileButton() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [showModal, setShowModal] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    void (async () => {
      try {
        const parsed = JSON.parse(saved) as Partial<Profile> & {
          displayName?: string
          dateOfBirth?: string
          password?: string
        }

        const nextProfile: Profile = {
          name: parsed.name ?? parsed.displayName ?? '',
          gender: parsed.gender === 'female' ? 'female' : 'male',
          dob: parsed.dob ?? parsed.dateOfBirth ?? '',
          email: parsed.email ?? '',
          passwordHash: parsed.passwordHash ?? ''
        }

        if (!nextProfile.passwordHash && parsed.password) {
          nextProfile.passwordHash = await bcrypt.hash(parsed.password, 10)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfile))
        }

        setProfile(nextProfile)
      } catch {
        // Corrupted data; treat as no profile.
      }
    })()
  }, [])

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const genderBadge = (value: 'male' | 'female') => (value === 'male' ? 'M' : 'F')

  const handleSave = async () => {
    if (!displayName.trim() || !dateOfBirth || !email.trim() || !password.trim()) return

    const passwordHash = await bcrypt.hash(password, 10)

    const newProfile: Profile = {
      name: displayName.trim(),
      gender,
      dob: dateOfBirth,
      email: email.trim(),
      passwordHash
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile))
    setProfile(newProfile)
    setPassword('')
    setShowModal(false)
  }

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY)
    setProfile(null)
    setDisplayName('')
    setGender('male')
    setDateOfBirth('')
    setEmail('')
    setPassword('')
    setShowModal(false)
  }

  const formatDOB = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <>
      <button
        id="profile-button"
        onClick={() => setShowModal(true)}
        className="relative h-10 w-10 shrink-0 cursor-pointer rounded-full border-2 border-[#1e1e1e] bg-[#0f0f0f] transition-all duration-200 hover:border-primary hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]"
        title={profile ? profile.name : 'Set up profile'}
      >
        {profile ? (
          <>
            <span className="text-primary text-sm font-semibold leading-none">{getInitials(profile.name)}</span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#1e1e1e] bg-black text-[9px] text-primary">
              {genderBadge(profile.gender)}
            </span>
          </>
        ) : (
          <User className="h-5 w-5 text-zinc-400" />
        )}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false)
          }}
        >
          <div className="w-full max-w-md rounded-[6px] border border-[#1e1e1e] bg-black p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {profile ? (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">Your Profile</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="cursor-pointer text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-6 flex flex-col items-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary text-2xl font-bold text-zinc-950">
                    {getInitials(profile.name)}
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-xl font-semibold text-zinc-100">
                    {profile.name}
                    <span className="text-lg text-primary">{genderBadge(profile.gender)}</span>
                  </p>
                </div>

                <div className="mb-6 space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-[#0f0f0f] px-4 py-3">
                    <span className="text-sm text-zinc-500">Gender</span>
                    <span className="text-sm capitalize text-zinc-200">{profile.gender}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#0f0f0f] px-4 py-3">
                    <span className="text-sm text-zinc-500">Date of Birth</span>
                    <span className="text-sm text-zinc-200">{formatDOB(profile.dob)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#0f0f0f] px-4 py-3">
                    <span className="text-sm text-zinc-500">Email</span>
                    <span className="text-sm text-zinc-200">{profile.email}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#0f0f0f] px-4 py-3">
                    <span className="text-sm text-zinc-500">Password</span>
                    <span className="text-sm tracking-widest text-zinc-400">********</span>
                  </div>
                </div>

                <button
                  onClick={handleClear}
                  className="w-full cursor-pointer rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Clear Profile
                </button>
              </>
            ) : (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">Set Up Profile</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="cursor-pointer text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="profile-name" className="mb-1.5 block text-sm text-zinc-400">
                      Display Name
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-primary/70 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <span className="mb-1.5 block text-sm text-zinc-400">Gender</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setGender('male')}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                          gender === 'male'
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-[#1e1e1e] bg-[#0f0f0f] text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        <span className="text-base">M</span> Male
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender('female')}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                          gender === 'female'
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-[#1e1e1e] bg-[#0f0f0f] text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        <span className="text-base">F</span> Female
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="profile-dob" className="mb-1.5 block text-sm text-zinc-400">
                      Date of Birth
                    </label>
                    <input
                      id="profile-dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] px-4 py-2.5 text-zinc-100 transition-colors [color-scheme:dark] focus:border-primary/70 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-email" className="mb-1.5 block text-sm text-zinc-400">
                      Email
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-primary/70 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-password" className="mb-1.5 block text-sm text-zinc-400">
                      Password
                    </label>
                    <input
                      id="profile-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="********"
                      className="w-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-primary/70 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 cursor-pointer rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] px-4 py-2.5 text-zinc-300 transition-colors hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSave()}
                    disabled={!displayName.trim() || !dateOfBirth || !email.trim() || !password.trim()}
                    className="flex-1 cursor-pointer rounded-lg bg-primary px-4 py-2.5 font-medium text-zinc-950 transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save Profile
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
