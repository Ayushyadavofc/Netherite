import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { ID, Permission, Role, type Models } from 'appwrite'
import { Camera, LoaderCircle, LogIn, Trash2, UserPlus, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { CharacterViewer } from '@/components/gacha/CharacterViewer'
import { defaultProfile, useProfile } from '@/hooks/use-data'
import { CharacterSelectionModal } from '@/components/gacha/CharacterSelectionModal'
import { getDefaultCharacterId, resolveCharacterId } from '@/lib/characters'
import { useGachaStore } from '@/stores/gachaStore'
import {
  AVATARS_BUCKET_ID,
  DATABASE_ID,
  USER_SETTINGS_COLLECTION_ID,
  databases,
  getAppwriteConfigurationError,
  isAppwriteConfigured,
  storage
} from '@/lib/appwrite'
import {
  getSyncDeviceEventName,
  isStaySignedInEnabled,
  setStaySignedInEnabled,
  syncCurrentDeviceRegistration
} from '@/lib/sync-server'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

type Gender = 'male' | 'female'
type AuthMode = 'register' | 'login'
type AuthUser = Models.User<Models.Preferences>
type CropPosition = { x: number; y: number }
type CropImageMetrics = { width: number; height: number }
type UserSettingsDocument = Models.Document & {
  gender?: string
  dob?: string
  avatar_id?: string
}

const CROP_VIEW_SIZE = 280
const CROPPED_OUTPUT_SIZE = 512
const defaultAuthForm = {
  name: '',
  email: '',
  password: '',
  gender: 'male' as Gender,
  dob: ''
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

const normalizeGender = (value?: string): Gender => {
  return value === 'female' ? 'female' : 'male'
}

const getErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof Error && error.message ? error.message : fallback
}

const getInitials = (value?: string) => {
  const segments = value?.trim().split(/\s+/).filter(Boolean) ?? []

  if (segments.length === 0) {
    return 'NT'
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
}

const formatDob = (value?: string) => {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(`${value}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(parsed)
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load that image.'))
    image.src = src
  })

type ProfileAvatarVisualProps = {
  imageUrl: string | null
  initials: string
  isAuthenticated: boolean
  containerClassName: string
  initialsClassName: string
  guestIconClassName: string
}

function ProfileAvatarVisual({
  imageUrl,
  initials,
  isAuthenticated,
  containerClassName,
  initialsClassName,
  guestIconClassName
}: ProfileAvatarVisualProps) {
  return (
    <div className={cn('overflow-hidden rounded-full border border-[#2a2422] bg-[#141010]', containerClassName)}>
      {imageUrl ? (
        <img src={imageUrl} alt={initials} className="h-full w-full object-cover" />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center font-black uppercase select-none',
            isAuthenticated ? 'bg-[#ff5625] text-black' : 'bg-[#141010] text-[#ff9b73]',
            initialsClassName
          )}
        >
          {isAuthenticated ? initials : <UserRound className={guestIconClassName} />}
        </div>
      )}
    </div>
  )
}

export default function ProfileButton() {
  const currentUser = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const checkAuth = useAuthStore((state) => state.checkAuth)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const register = useAuthStore((state) => state.register)
  const changeSelectedCharacter = useGachaStore((state) => state.changeSelectedCharacter)
  const syncGachaProfile = useGachaStore((state) => state.syncProfile)
  const gachaWallet = useGachaStore((state) => state.wallet)
  const gachaStreak = useGachaStore((state) => state.streak)
  const selectedCharacter = useGachaStore((state) => state.selectedCharacter)
  const [storedProfile, setStoredProfile] = useProfile()
  const [isOpen, setIsOpen] = useState(false)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('register')
  const [authForm, setAuthForm] = useState(defaultAuthForm)
  const [pendingCharacterId, setPendingCharacterId] = useState<string>(getDefaultCharacterId('male'))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [settingsDocument, setSettingsDocument] = useState<UserSettingsDocument | null>(null)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const [cropImageMetrics, setCropImageMetrics] = useState<CropImageMetrics | null>(null)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropPosition, setCropPosition] = useState<CropPosition>({ x: 0, y: 0 })
  const [staySignedIn, setStaySignedInState] = useState(() => isStaySignedInEnabled())
  const [dragOrigin, setDragOrigin] = useState<{
    pointerX: number
    pointerY: number
    position: CropPosition
  } | null>(null)
  const [isAvatarBusy, setIsAvatarBusy] = useState(false)
  const [isStaySignedInBusy, setIsStaySignedInBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const settingsRequestRef = useRef(0)
  const isCloudAuthAvailable = isAppwriteConfigured()
  const cloudAuthMessage =
    getAppwriteConfigurationError() ??
    'Cloud profile features are unavailable in this build. Add the Appwrite environment variables to enable login, registration, sync, and avatars.'

  const avatarId = settingsDocument?.avatar_id?.trim() ?? ''
  const avatarPreviewUrl = useMemo(() => {
    if (!currentUser || !avatarId) {
      return null
    }

    return String(storage.getFilePreview(AVATARS_BUCKET_ID, avatarId))
  }, [avatarId, currentUser])

  const displayName = currentUser?.name?.trim() || 'Adventurer'
  const displayGender = normalizeGender(settingsDocument?.gender ?? storedProfile.gender)
  const activeCharacterId = resolveCharacterId(selectedCharacter, displayGender)
  const shouldWarnOnCharacterChange =
    (gachaWallet?.scraps ?? 0) > 0 || (gachaWallet?.gems ?? 0) > 0 || (gachaStreak?.currentStreak ?? 0) > 0
  const cropDisplayMetrics = useMemo(() => {
    if (!cropImageMetrics) {
      return null
    }

    const baseScale = Math.max(
      CROP_VIEW_SIZE / cropImageMetrics.width,
      CROP_VIEW_SIZE / cropImageMetrics.height
    )
    const scale = baseScale * cropZoom

    return {
      width: cropImageMetrics.width * scale,
      height: cropImageMetrics.height * scale,
      scale
    }
  }, [cropImageMetrics, cropZoom])

  const syncStoredProfile = (user: AuthUser | null, document: UserSettingsDocument | null) => {
    if (!user) {
      setStoredProfile(defaultProfile)
      return
    }

    setStoredProfile((previous) => ({
      ...previous,
      name: user.name || 'Adventurer',
      email: user.email,
      gender: normalizeGender(document?.gender ?? previous.gender),
      dob: document?.dob ?? previous.dob ?? '',
      avatarId: document?.avatar_id?.trim() ?? previous.avatarId ?? '',
      geminiApiKey: previous.geminiApiKey ?? ''
    }))
  }

  const clampCropPosition = (
    nextPosition: CropPosition,
    nextZoom = cropZoom,
    nextMetrics = cropImageMetrics
  ) => {
    if (!nextMetrics) {
      return nextPosition
    }

    const baseScale = Math.max(
      CROP_VIEW_SIZE / nextMetrics.width,
      CROP_VIEW_SIZE / nextMetrics.height
    )
    const scaledWidth = nextMetrics.width * baseScale * nextZoom
    const scaledHeight = nextMetrics.height * baseScale * nextZoom
    const maxX = Math.max(0, (scaledWidth - CROP_VIEW_SIZE) / 2)
    const maxY = Math.max(0, (scaledHeight - CROP_VIEW_SIZE) / 2)

    return {
      x: clamp(nextPosition.x, -maxX, maxX),
      y: clamp(nextPosition.y, -maxY, maxY)
    }
  }

  const resetCropper = () => {
    setPendingAvatarFile(null)
    setCropSourceUrl(null)
    setCropImageMetrics(null)
    setCropZoom(1)
    setCropPosition({ x: 0, y: 0 })
    setDragOrigin(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const closeModal = () => {
    setIsOpen(false)
    setError(null)
    resetCropper()
  }

  const loadSettingsDocument = async (user: AuthUser, requestId = settingsRequestRef.current) => {
    setIsLoadingProfile(true)

    try {
      const nextDocument = (await databases.getDocument(
        DATABASE_ID,
        USER_SETTINGS_COLLECTION_ID,
        user.$id
      )) as UserSettingsDocument

      if (settingsRequestRef.current !== requestId || useAuthStore.getState().user?.$id !== user.$id) {
        return
      }

      setSettingsDocument(nextDocument)
      syncStoredProfile(user, nextDocument)
    } catch {
      if (settingsRequestRef.current !== requestId || useAuthStore.getState().user?.$id !== user.$id) {
        return
      }

      setSettingsDocument(null)
      syncStoredProfile(user, null)
    } finally {
      if (settingsRequestRef.current === requestId) {
        setIsLoadingProfile(false)
      }
    }
  }

  const ensureSettingsDocument = async (user: AuthUser) => {
    try {
      return (await databases.getDocument(
        DATABASE_ID,
        USER_SETTINGS_COLLECTION_ID,
        user.$id
      )) as UserSettingsDocument
    } catch {
      const createdDocument = (await databases.createDocument(
        DATABASE_ID,
        USER_SETTINGS_COLLECTION_ID,
        user.$id,
        {
          gender: normalizeGender(settingsDocument?.gender ?? storedProfile.gender ?? authForm.gender),
          dob: settingsDocument?.dob ?? storedProfile.dob ?? authForm.dob,
          avatar_id: settingsDocument?.avatar_id?.trim() ?? storedProfile.avatarId ?? ''
        },
        [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id))
        ]
      )) as UserSettingsDocument

      syncStoredProfile(user, createdDocument)

      return createdDocument
    }
  }

  const createCroppedAvatar = async () => {
    if (!cropSourceUrl || !cropDisplayMetrics || !pendingAvatarFile) {
      throw new Error('Choose an image before saving.')
    }

    const image = await loadImage(cropSourceUrl)
    const canvas = document.createElement('canvas')
    canvas.width = CROPPED_OUTPUT_SIZE
    canvas.height = CROPPED_OUTPUT_SIZE

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not prepare the image cropper.')
    }

    const imageLeft = CROP_VIEW_SIZE / 2 + cropPosition.x - cropDisplayMetrics.width / 2
    const imageTop = CROP_VIEW_SIZE / 2 + cropPosition.y - cropDisplayMetrics.height / 2
    const sourceX = (0 - imageLeft) / cropDisplayMetrics.scale
    const sourceY = (0 - imageTop) / cropDisplayMetrics.scale
    const sourceSize = CROP_VIEW_SIZE / cropDisplayMetrics.scale

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      CROPPED_OUTPUT_SIZE,
      CROPPED_OUTPUT_SIZE
    )

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Could not crop that image.'))
          return
        }

        resolve(nextBlob)
      }, 'image/png')
    })

    const nextName = pendingAvatarFile.name.replace(/\.[^.]+$/, '') || 'avatar'

    return new File([blob], `${nextName}.png`, { type: 'image/png' })
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    if (!nextFile.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const nextUrl = typeof reader.result === 'string' ? reader.result : null

      if (!nextUrl) {
        setError('Could not load that image.')
        return
      }

      setPendingAvatarFile(nextFile)
      setCropSourceUrl(nextUrl)
      setCropImageMetrics(null)
      setCropZoom(1)
      setCropPosition({ x: 0, y: 0 })
      setDragOrigin(null)
      setError(null)
    }

    reader.onerror = () => {
      setError('Could not load that image.')
    }

    reader.readAsDataURL(nextFile)
  }

  const handleUploadAvatar = async () => {
    if (!currentUser) {
      setError('Sign in before uploading a profile photo.')
      return
    }

    setIsAvatarBusy(true)
    setError(null)

    let uploadedFileId = ''

    try {
      const croppedAvatar = await createCroppedAvatar()
      const settings = await ensureSettingsDocument(currentUser)
      const uploadedFile = await storage.createFile(AVATARS_BUCKET_ID, ID.unique(), croppedAvatar, [
        Permission.read(Role.any()),
        Permission.update(Role.user(currentUser.$id)),
        Permission.delete(Role.user(currentUser.$id))
      ])

      uploadedFileId = uploadedFile.$id

      const updatedSettings = (await databases.updateDocument(
        DATABASE_ID,
        USER_SETTINGS_COLLECTION_ID,
        settings.$id,
        {
          avatar_id: uploadedFile.$id
        }
      )) as UserSettingsDocument

      setSettingsDocument(updatedSettings)
      syncStoredProfile(currentUser, updatedSettings)

      if (settings.avatar_id && settings.avatar_id !== uploadedFile.$id) {
        void storage.deleteFile(AVATARS_BUCKET_ID, settings.avatar_id).catch(() => undefined)
      }

      toast.success('Profile photo updated.')
      resetCropper()
    } catch (uploadError) {
      if (uploadedFileId) {
        void storage.deleteFile(AVATARS_BUCKET_ID, uploadedFileId).catch(() => undefined)
      }

      setError(getErrorMessage(uploadError, 'Could not update your profile photo.'))
    } finally {
      setIsAvatarBusy(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!currentUser || !avatarId) {
      return
    }

    setIsAvatarBusy(true)
    setError(null)

    try {
      const settings = await ensureSettingsDocument(currentUser)
      const updatedSettings = (await databases.updateDocument(
        DATABASE_ID,
        USER_SETTINGS_COLLECTION_ID,
        settings.$id,
        {
          avatar_id: ''
        }
      )) as UserSettingsDocument

      setSettingsDocument(updatedSettings)
      syncStoredProfile(currentUser, updatedSettings)
      await storage.deleteFile(AVATARS_BUCKET_ID, avatarId).catch(() => undefined)
      toast.success('Profile photo removed.')
    } catch (removeError) {
      setError(getErrorMessage(removeError, 'Could not remove your profile photo.'))
    } finally {
      setIsAvatarBusy(false)
    }
  }

  const handleRegisterWithCharacter = async (characterId: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const resolvedCharacterId = resolveCharacterId(characterId, authForm.gender)
      setPendingCharacterId(resolvedCharacterId)
      await register(
        authForm.email.trim(),
        authForm.password,
        authForm.name.trim(),
        authForm.gender,
        authForm.dob,
        resolvedCharacterId
      )

      const nextUser = useAuthStore.getState().user
      if (nextUser) {
        settingsRequestRef.current += 1
        await loadSettingsDocument(nextUser, settingsRequestRef.current)
        await syncCurrentDeviceRegistration(nextUser.$id).catch(() => undefined)
        await syncGachaProfile().catch(() => undefined)
      }

      setAuthForm((current) => ({
        ...current,
        password: ''
      }))
      toast.success('Profile created.')
    } catch (registerError) {
      setError(getErrorMessage(registerError, 'Could not create that account.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = () => {
    setError(null)
    setPendingCharacterId((current) => resolveCharacterId(current, authForm.gender))
    setShowCharacterModal(true)
  }

  const handleLogin = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      await login(authForm.email.trim(), authForm.password)

      const nextUser = useAuthStore.getState().user
      if (nextUser) {
        settingsRequestRef.current += 1
        await loadSettingsDocument(nextUser, settingsRequestRef.current)
        await syncCurrentDeviceRegistration(nextUser.$id).catch(() => undefined)
      }

      setAuthForm((current) => ({
        ...current,
        password: ''
      }))
      toast.success('Logged in.')
    } catch (loginError) {
      setError(getErrorMessage(loginError, 'Could not sign in with those details.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      await logout()
      setSettingsDocument(null)
      setStoredProfile(defaultProfile)
      setAuthForm(defaultAuthForm)
      resetCropper()
      setAuthMode('login')
      closeModal()
      toast.success('Signed out.')
    } catch (signOutError) {
      setError(getErrorMessage(signOutError, 'Could not sign out right now.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStaySignedInChange = async (enabled: boolean) => {
    setStaySignedInState(enabled)
    setStaySignedInEnabled(enabled)

    if (!currentUser) {
      return
    }

    setIsStaySignedInBusy(true)
    setError(null)

    try {
      await syncCurrentDeviceRegistration(currentUser.$id)
      toast.success(
        enabled
          ? 'This device will keep vault entries until it checks them.'
          : 'This device will no longer block vault cleanup.'
      )
    } catch (syncError) {
      setStaySignedInState(!enabled)
      setStaySignedInEnabled(!enabled)
      setError(getErrorMessage(syncError, 'Could not update stay signed in for this device.'))
    } finally {
      setIsStaySignedInBusy(false)
    }
  }

  const handleCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!cropImageMetrics) {
      return
    }

    event.preventDefault()
    setDragOrigin({
      pointerX: event.clientX,
      pointerY: event.clientY,
      position: cropPosition
    })
  }

  const handleCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin) {
      return
    }

    const nextPosition = clampCropPosition({
      x: dragOrigin.position.x + (event.clientX - dragOrigin.pointerX),
      y: dragOrigin.position.y + (event.clientY - dragOrigin.pointerY)
    })

    setCropPosition(nextPosition)
  }

  const handleChangeCharacter = async (characterId: string) => {
    try {
      await changeSelectedCharacter(characterId)
      toast.success('Character updated.')
    } catch (e) {
      toast.error('Failed to update character.')
    }
  }

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  useEffect(() => {
    settingsRequestRef.current += 1
    const requestId = settingsRequestRef.current

    if (!currentUser) {
      setSettingsDocument(null)
      setIsLoadingProfile(false)
      syncStoredProfile(null, null)
      return
    }

    setAuthForm((current) => ({
      ...current,
      name: currentUser.name ?? current.name,
      email: currentUser.email,
      password: ''
    }))

    void loadSettingsDocument(currentUser, requestId)
  }, [currentUser])

  useEffect(() => {
    if (!cropSourceUrl) {
      return
    }

    return () => {
      URL.revokeObjectURL(cropSourceUrl)
    }
  }, [cropSourceUrl])

  useEffect(() => {
    const handleSyncDeviceUpdate = () => {
      setStaySignedInState(isStaySignedInEnabled())
    }

    const syncDeviceEvent = getSyncDeviceEventName()
    window.addEventListener(syncDeviceEvent, handleSyncDeviceUpdate)
    window.addEventListener('storage', handleSyncDeviceUpdate)

    return () => {
      window.removeEventListener(syncDeviceEvent, handleSyncDeviceUpdate)
      window.removeEventListener('storage', handleSyncDeviceUpdate)
    }
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2422] bg-[#141010] shadow-[0_6px_16px_rgba(0,0,0,0.2)] transition-all hover:border-[#ff5625]/70 hover:shadow-[0_8px_18px_rgba(255,86,37,0.12)]"
        aria-label="Open profile"
      >
        <ProfileAvatarVisual
          imageUrl={avatarPreviewUrl}
          initials={getInitials(displayName)}
          isAuthenticated={isAuthenticated}
          containerClassName="h-full w-full border-[#2a2422]"
          initialsClassName="text-[0.66rem] tracking-tight"
          guestIconClassName="h-3.5 w-3.5 stroke-[2.1]"
        />
        {!isAuthenticated ? (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0a0808] bg-[#ff5625]" />
        ) : null}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
      />

      <Dialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal()
            return
          }

          setIsOpen(true)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden border-[#2a2422] bg-[#050404] p-0 text-white shadow-[0_28px_100px_rgba(0,0,0,0.68)] sm:max-w-[470px]"
        >
          <div className="relative">
            <div className="border border-[#2a2422] bg-[#050404] p-5 sm:p-6">
              <div className="flex items-start justify-between">
                <DialogTitle className="text-[1.28rem] font-extrabold tracking-tight text-white">
                  {isAuthenticated ? 'Your Profile' : 'Profile Access'}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {isAuthenticated
                    ? 'Manage your profile, avatar, and current character.'
                    : 'Sign in or register to manage your profile and character.'}
                </DialogDescription>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full p-1 text-[#7c7272] transition-colors hover:text-white"
                  aria-label="Close profile"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-5 flex flex-col items-center text-center">
                <div className="relative">
                  <ProfileAvatarVisual
                    imageUrl={avatarPreviewUrl}
                    initials={getInitials(displayName)}
                    isAuthenticated={isAuthenticated}
                    containerClassName="h-24 w-24 shadow-[0_14px_32px_rgba(0,0,0,0.3)]"
                    initialsClassName="text-[1.45rem] tracking-tight"
                    guestIconClassName="h-7 w-7 stroke-[2.05]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated) {
                        setError('Sign in before uploading a profile photo.')
                        return
                      }

                      fileInputRef.current?.click()
                    }}
                    className="absolute -bottom-1 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-[#0a0808] bg-[#ff5625] text-black shadow-[0_10px_24px_rgba(255,86,37,0.35)] transition-transform hover:scale-105"
                    aria-label={avatarPreviewUrl ? 'Change profile photo' : 'Add profile photo'}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isAuthenticated ? (
                  <>
                    <h3 className="mt-5 text-[1.45rem] font-extrabold leading-none text-white">
                      {displayName} <span className="text-[#ff5625]">{displayGender === 'female' ? 'F' : 'M'}</span>
                    </h3>
                    <div className="mt-5 w-full rounded-[24px] border border-[var(--nv-border)] bg-[#111111] px-4 py-5">
                      <div className="flex justify-center">
                        <CharacterViewer
                          characterId={activeCharacterId}
                          size="large"
                          showControls
                          showLabel
                        />
                      </div>
                      <div className="mt-4 flex flex-col items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setShowCharacterModal(true)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--nv-border)] bg-[var(--nv-surface-strong)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-[var(--nv-primary)]"
                        >
                          Change Character
                        </button>
                        {avatarId ? (
                          <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            disabled={isAvatarBusy}
                            className="inline-flex items-center gap-2 rounded-full border border-[#47241a] bg-[#1a100d] px-4 py-2 text-sm font-semibold text-[#ffb395] transition-colors hover:border-[#ff5625]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove avatar
                          </button>
                        ) : (
                          <p className="text-[0.64rem] uppercase tracking-[0.22em] text-[#8f6f62]">
                            Personalize your profile
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-[0.62rem] uppercase tracking-[0.24em] text-[#9a6e5f]">
                      {isCloudAuthAvailable ? 'Sign in to upload a profile photo' : 'Cloud profile features are unavailable'}
                    </p>

                    <div className="mt-5 grid w-full grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('register')
                          setError(null)
                        }}
                        className={cn(
                          'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
                          authMode === 'register'
                            ? 'border-[#ff5625] bg-[#301209] text-[#ff8d61]'
                            : 'border-[#2a2422] bg-[#111111] text-[#a8a0a0] hover:border-[#ff5625]/50 hover:text-white',
                          !isCloudAuthAvailable && 'cursor-not-allowed opacity-50 hover:border-[#2a2422] hover:text-[#a8a0a0]'
                        )}
                        disabled={!isCloudAuthAvailable}
                      >
                        <UserPlus className="h-5 w-5" />
                        Register
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('login')
                          setError(null)
                        }}
                        className={cn(
                          'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
                          authMode === 'login'
                            ? 'border-[#ff5625] bg-[#301209] text-[#ff8d61]'
                            : 'border-[#2a2422] bg-[#111111] text-[#a8a0a0] hover:border-[#ff5625]/50 hover:text-white',
                          !isCloudAuthAvailable && 'cursor-not-allowed opacity-50 hover:border-[#2a2422] hover:text-[#a8a0a0]'
                        )}
                        disabled={!isCloudAuthAvailable}
                      >
                        <LogIn className="h-5 w-5" />
                        Login
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isAuthenticated ? (
                <div className="mt-6 space-y-3">
                  <label className="flex items-start justify-between gap-4 rounded-xl bg-[#111111] px-4 py-3.5">
                    <div>
                      <p className="text-sm font-semibold text-white">Stay signed in on this device</p>
                      <p className="mt-1 text-xs text-[#7a7373]">
                        Registered devices keep cloud vaults until they have checked them.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={staySignedIn}
                      onChange={(event) => {
                        void handleStaySignedInChange(event.target.checked)
                      }}
                      disabled={isStaySignedInBusy || isSubmitting}
                      className="mt-1 h-4 w-4 accent-[#ff5625] disabled:cursor-not-allowed"
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#111111] px-4 py-3.5">
                    <span className="text-sm text-[#7a7373]">Gender</span>
                    <span className="text-sm font-semibold text-white">{displayGender === 'female' ? 'Female' : 'Male'}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#111111] px-4 py-3.5">
                    <span className="text-sm text-[#7a7373]">Date of Birth</span>
                    <span className="text-sm font-semibold text-white">
                      {isLoadingProfile ? 'Loading...' : formatDob(settingsDocument?.dob)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#111111] px-4 py-3.5">
                    <span className="text-sm text-[#7a7373]">Email</span>
                    <span className="max-w-[210px] truncate text-sm font-semibold text-white">
                      {currentUser?.email ?? 'Not available'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {authMode === 'register' ? (
                    <>
                      <div className="space-y-2">
                        <label className="block text-sm text-[#c9c4c4]">Display Name</label>
                        <input
                          value={authForm.name}
                          onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="John Doe"
                          disabled={!isCloudAuthAvailable}
                          className="h-11 w-full rounded-xl border border-[#2a2422] bg-[#111111] px-4 text-sm text-white outline-none transition-colors placeholder:text-[#6d6767] focus:border-[#ff5625]"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm text-[#c9c4c4]">Gender</label>
                        <div className="grid grid-cols-2 gap-3">
                          {(['male', 'female'] as const).map((gender) => {
                            const active = authForm.gender === gender

                            return (
                              <button
                                key={gender}
                                type="button"
                                onClick={() => {
                                  setAuthForm((current) => ({ ...current, gender }))
                                  setPendingCharacterId((current) => resolveCharacterId(current, gender))
                                }}
                                disabled={!isCloudAuthAvailable}
                                className={cn(
                                  'flex h-11 items-center justify-center gap-3 rounded-xl border text-lg font-semibold transition-colors',
                                  active
                                    ? 'border-[#ff5625] bg-[#301209] text-[#ff8d61]'
                                    : 'border-[#2a2422] bg-[#111111] text-[#9d9494] hover:border-[#ff5625]/50 hover:text-white',
                                  !isCloudAuthAvailable && 'cursor-not-allowed opacity-50 hover:border-[#2a2422] hover:text-[#9d9494]'
                                )}
                              >
                                <span>{gender === 'male' ? 'M' : 'F'}</span>
                                <span className="text-sm">{gender === 'male' ? 'Male' : 'Female'}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm text-[#c9c4c4]">Date of Birth</label>
                        <input
                          type="date"
                          value={authForm.dob}
                          onChange={(event) => setAuthForm((current) => ({ ...current, dob: event.target.value }))}
                          disabled={!isCloudAuthAvailable}
                          className="h-11 w-full rounded-xl border border-[#2a2422] bg-[#111111] px-4 text-sm text-white outline-none transition-colors focus:border-[#ff5625]"
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="space-y-2">
                    <label className="block text-sm text-[#c9c4c4]">Email</label>
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="you@example.com"
                      disabled={!isCloudAuthAvailable}
                      className="h-11 w-full rounded-xl border border-[#2a2422] bg-[#111111] px-4 text-sm text-white outline-none transition-colors placeholder:text-[#6d6767] focus:border-[#ff5625]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm text-[#c9c4c4]">Password</label>
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="********"
                      disabled={!isCloudAuthAvailable}
                      className="h-11 w-full rounded-xl border border-[#2a2422] bg-[#111111] px-4 text-sm text-white outline-none transition-colors placeholder:text-[#6d6767] focus:border-[#ff5625]"
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-[#2a2422] bg-[#111111] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={staySignedIn}
                      onChange={(event) => {
                        setStaySignedInState(event.target.checked)
                        setStaySignedInEnabled(event.target.checked)
                      }}
                      disabled={!isCloudAuthAvailable}
                      className="mt-0.5 h-4 w-4 accent-[#ff5625]"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">Stay signed in on this device</p>
                      <p className="mt-1 text-xs text-[#7a7373]">
                        This device will register for cloud vault acknowledgement after you sign in.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {!isAuthenticated && !isCloudAuthAvailable ? (
                <Alert
                  variant="destructive"
                  className="mt-5 rounded-xl border border-[#6d3524] bg-[#24110c] px-4 py-3 text-[#ffcfbf]"
                >
                  <AlertDescription className="col-start-1 text-sm text-[#ffcfbf]">
                    Cloud login, registration, avatars, and sync are disabled until Appwrite is configured for this build.
                  </AlertDescription>
                </Alert>
              ) : null}

              {error ? (
                <Alert
                  variant="destructive"
                  className="mt-5 rounded-xl border border-[#84281c] bg-[#2a0d0b] px-4 py-3 text-[#ffb7a4]"
                >
                  <AlertDescription className="col-start-1 text-sm text-[#ffb7a4]">
                    {error.startsWith('Appwrite is disabled.') ? cloudAuthMessage : error}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-11 rounded-xl border border-[#2a2422] bg-[#111111] text-base font-medium text-[#d2cccc] transition-colors hover:border-[#3b3230] hover:text-white"
                >
                  {isAuthenticated ? 'Close' : 'Cancel'}
                </button>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSubmitting}
                    className="inline-flex h-11 items-center justify-center gap-3 rounded-xl border border-[#5d2617] bg-[#2a120c] text-base font-medium text-[#ff8d61] transition-colors hover:border-[#ff5625] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5 rotate-180" />}
                    Sign Out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={authMode === 'register' ? handleRegister : handleLogin}
                    disabled={
                      !isCloudAuthAvailable ||
                      isSubmitting ||
                      !authForm.email.trim() ||
                      !authForm.password.trim() ||
                      (authMode === 'register' && !authForm.name.trim())
                    }
                    className="inline-flex h-11 items-center justify-center gap-3 rounded-xl bg-[#ff5625] text-base font-semibold text-black transition-colors hover:bg-[#ff6c3d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : authMode === 'register' ? (
                      <UserPlus className="h-5 w-5" />
                    ) : (
                      <LogIn className="h-5 w-5" />
                    )}
                    {authMode === 'register' ? 'Register' : 'Login'}
                  </button>
                )}
              </div>
            </div>

            {cropSourceUrl ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm">
                <div className="w-full max-w-[430px] rounded-[30px] border border-[#2a2422] bg-[#0a0808] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.5)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-white">Crop Profile Photo</h3>
                      <p className="mt-1 text-xs uppercase tracking-[0.28em] text-[#8b7873]">
                        Drag to reposition
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetCropper}
                      className="rounded-full p-1 text-[#7c7272] transition-colors hover:text-white"
                      aria-label="Cancel crop"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-5 flex justify-center">
                    <div
                      onPointerDown={handleCropPointerDown}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={() => setDragOrigin(null)}
                      onPointerLeave={() => setDragOrigin(null)}
                      className="relative h-[280px] w-[280px] touch-none overflow-hidden rounded-[30px] border border-[#2a2422] bg-[#141010] cursor-grab active:cursor-grabbing"
                    >
                      {cropSourceUrl ? (
                        <img
                          src={cropSourceUrl}
                          alt="Crop preview"
                          onLoad={(event) => {
                            const nextMetrics = {
                              width: event.currentTarget.naturalWidth,
                              height: event.currentTarget.naturalHeight
                            }

                            setCropImageMetrics(nextMetrics)
                            setCropPosition(clampCropPosition({ x: 0, y: 0 }, cropZoom, nextMetrics))
                          }}
                          draggable={false}
                          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                          style={{
                            width: cropDisplayMetrics?.width ?? 'auto',
                            height: cropDisplayMetrics?.height ?? 'auto',
                            transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px))`
                          }}
                        />
                      ) : null}
                      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
                      <div className="pointer-events-none absolute inset-[18px] rounded-full border border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-[#8b7873]">
                      <span>Zoom</span>
                      <span>{cropZoom.toFixed(1)}x</span>
                    </div>
                    <Slider
                      min={1}
                      max={3}
                      step={0.05}
                      value={[cropZoom]}
                      onValueChange={(values) => {
                        const nextZoom = values[0] ?? 1
                        setCropZoom(nextZoom)
                        setCropPosition((current) => clampCropPosition(current, nextZoom))
                      }}
                      className="[&_[data-slot=slider-range]]:bg-[#ff5625] [&_[data-slot=slider-thumb]]:border-[#ff5625] [&_[data-slot=slider-track]]:bg-[#2a2422]"
                    />
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={resetCropper}
                      className="h-12 rounded-2xl border border-[#2a2422] bg-[#111111] text-lg font-medium text-[#d2cccc] transition-colors hover:border-[#3b3230] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadAvatar}
                      disabled={isAvatarBusy || !cropImageMetrics}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff5625] text-lg font-semibold text-black transition-colors hover:bg-[#ff6c3d] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAvatarBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Camera className="h-4 w-4" />}
                      Save Photo
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <CharacterSelectionModal
        isOpen={showCharacterModal}
        onClose={() => setShowCharacterModal(false)}
        onSelect={isAuthenticated ? handleChangeCharacter : handleRegisterWithCharacter}
        gender={isAuthenticated ? normalizeGender(settingsDocument?.gender ?? storedProfile.gender) : authForm.gender}
        currentCharacterId={isAuthenticated ? activeCharacterId : pendingCharacterId}
        showWarning={isAuthenticated ? shouldWarnOnCharacterChange : false}
        confirmLabel={isAuthenticated ? 'Apply Character' : 'Create Account'}
        isLoading={isSubmitting}
      />
    </>
  )
}
