"use client"

import { useState, useEffect } from "react"
import { User, X } from "lucide-react"

interface Profile {
  displayName: string
  gender: "male" | "female"
  dateOfBirth: string
  email: string
  password: string
}

const STORAGE_KEY = "netherite-profile"

export default function ProfileButton() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Form state
  const [displayName, setDisplayName] = useState("")
  const [gender, setGender] = useState<"male" | "female">("male")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setProfile(JSON.parse(saved))
      } catch {
        // corrupted data — treat as no profile
      }
    }
  }, [])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const genderSymbol = (g: "male" | "female") => (g === "male" ? "♂" : "♀")

  const handleSave = () => {
    if (!displayName.trim() || !dateOfBirth || !email.trim() || !password.trim()) return

    const newProfile: Profile = {
      displayName: displayName.trim(),
      gender,
      dateOfBirth,
      email: email.trim(),
      password: password.trim(),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile))
    setProfile(newProfile)
    setShowModal(false)
  }

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY)
    setProfile(null)
    setDisplayName("")
    setGender("male")
    setDateOfBirth("")
    setEmail("")
    setPassword("")
    setShowModal(false)
  }

  const formatDOB = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <>
      {/* Circular Profile Button */}
      <button
        id="profile-button"
        onClick={() => setShowModal(true)}
        className="relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200 cursor-pointer shrink-0
          bg-zinc-800 border-zinc-700 hover:border-amber-500 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]"
        title={profile ? profile.displayName : "Set up profile"}
      >
        {profile ? (
          <>
            <span className="text-amber-500 font-semibold text-sm leading-none">
              {getInitials(profile.displayName)}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[9px] text-amber-400">
              {genderSymbol(profile.gender)}
            </span>
          </>
        ) : (
          <User className="w-5 h-5 text-zinc-400" />
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false)
          }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {profile ? (
              /* ── Profile View ── */
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-zinc-100 text-lg font-semibold">Your Profile</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Avatar */}
                <div className="flex flex-col items-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-zinc-950 text-2xl font-bold">
                    {getInitials(profile.displayName)}
                  </div>
                  <p className="mt-3 text-zinc-100 text-xl font-semibold flex items-center gap-2">
                    {profile.displayName}
                    <span className="text-amber-400 text-lg">{genderSymbol(profile.gender)}</span>
                  </p>
                </div>

                {/* Info Rows */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-zinc-500 text-sm">Gender</span>
                    <span className="text-zinc-200 text-sm capitalize">{profile.gender}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-zinc-500 text-sm">Date of Birth</span>
                    <span className="text-zinc-200 text-sm">{formatDOB(profile.dateOfBirth)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-zinc-500 text-sm">Email</span>
                    <span className="text-zinc-200 text-sm">{profile.email}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-800/50 rounded-lg px-4 py-3">
                    <span className="text-zinc-500 text-sm">Password</span>
                    <span className="text-zinc-400 text-sm tracking-widest">••••••••</span>
                  </div>
                </div>

                <button
                  onClick={handleClear}
                  className="w-full px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors cursor-pointer"
                >
                  Clear Profile
                </button>
              </>
            ) : (
              /* ── Setup Form ── */
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-zinc-100 text-lg font-semibold">Set Up Profile</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Display Name */}
                  <div>
                    <label htmlFor="profile-name" className="block text-zinc-400 text-sm mb-1.5">
                      Display Name
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                      autoFocus
                    />
                  </div>

                  {/* Gender */}
                  <div>
                    <span className="block text-zinc-400 text-sm mb-1.5">Gender</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setGender("male")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                          gender === "male"
                            ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        <span className="text-base">♂</span> Male
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender("female")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                          gender === "female"
                            ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        <span className="text-base">♀</span> Female
                      </button>
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label htmlFor="profile-dob" className="block text-zinc-400 text-sm mb-1.5">
                      Date of Birth
                    </label>
                    <input
                      id="profile-dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-amber-500/70 transition-colors [color-scheme:dark]"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="profile-email" className="block text-zinc-400 text-sm mb-1.5">
                      Email
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="profile-password" className="block text-zinc-400 text-sm mb-1.5">
                      Password
                    </label>
                    <input
                      id="profile-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!displayName.trim() || !dateOfBirth || !email.trim() || !password.trim()}
                    className="flex-1 px-4 py-2.5 bg-amber-500 rounded-lg text-zinc-950 font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
