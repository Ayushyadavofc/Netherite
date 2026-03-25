import { useState, useEffect } from 'react'
import { X, Copy, CheckCircle2 } from 'lucide-react'
import { getCurrentVaultId, useVaultSettings } from '@/hooks/use-data'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [currentVaultId] = useState(getCurrentVaultId())
  const [settings, setSettings] = useVaultSettings()
  
  const [availableVaults, setAvailableVaults] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Find all vault IDs that have settings
      const allKeys = Object.keys(window.localStorage)
      const vaultIds = new Set<string>()
      allKeys.forEach(key => {
        if (key.startsWith('netherite-vault-') && key.endsWith('-settings')) {
          const id = key.split('-')[2]
          if (id && id !== currentVaultId) {
            vaultIds.add(id)
          }
        }
      })
      // If we don't have many, let's just show some defaults for demo purposes or keep empty
      setAvailableVaults(Array.from(vaultIds))
    }
  }, [isOpen, currentVaultId])

  const copySettingsFrom = (sourceId: string) => {
    try {
      const sourceKey = `netherite-vault-${sourceId}-settings`
      const sourceDataStr = window.localStorage.getItem(sourceKey)
      if (sourceDataStr) {
        const sourceData = JSON.parse(sourceDataStr)
        setSettings({ ...settings, ...sourceData })
        setCopiedId(sourceId)
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch (error) {
      console.warn('Failed to copy settings', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-[#1e1e1e] rounded-[6px] w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#1e1e1e] flex items-center justify-between bg-black">
          <h2 className="text-lg font-bold text-zinc-100">Vault Settings</h2>
          <button 
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-[#0f0f0f] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto min-h-[300px]">
          
          <div className="space-y-6">
            {/* General Settings Placeholder */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider">Appearance</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-black border border-[#1e1e1e] rounded-[6px] cursor-pointer hover:border-primary/50 transition-colors">
                  <input type="checkbox" className="accent-amber-500 w-4 h-4" defaultChecked />
                  <span className="text-sm font-medium text-zinc-200">Show Vault stats in Sidebar</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-black border border-[#1e1e1e] rounded-[6px] cursor-pointer hover:border-primary/50 transition-colors">
                  <input type="checkbox" className="accent-amber-500 w-4 h-4" defaultChecked />
                  <span className="text-sm font-medium text-zinc-200">Enable Scraps animations</span>
                </label>
              </div>
            </div>

            <hr className="border-[#1e1e1e]" />

            {/* Copy Settings Feature */}
            <div>
              <h3 className="text-sm font-semibold text-primary mb-2 uppercase tracking-wider flex items-center gap-2">
                <Copy className="w-4 h-4" /> Sync Settings
              </h3>
              <p className="text-xs text-zinc-500 mb-4">
                Copy configuration (like layouts and preferences) from another vault into the current vault ({currentVaultId}).
              </p>

              <div className="space-y-2">
                {availableVaults.length > 0 ? (
                  availableVaults.map(id => (
                    <div key={id} className="flex items-center justify-between p-3 bg-black border border-[#1e1e1e] rounded-[6px]">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-200">Vault: {id}</span>
                      </div>
                      <button
                        onClick={() => copySettingsFrom(id)}
                        disabled={copiedId === id}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                          copiedId === id 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-[#0f0f0f] hover:bg-primary text-zinc-300 hover:text-zinc-950'
                        }`}
                      >
                        {copiedId === id ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Copied!</>
                        ) : (
                          'Copy'
                        )}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 bg-black border border-dashed border-[#1e1e1e] rounded-[6px] text-center">
                    <p className="text-sm text-zinc-500">No other vaults found.</p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-[6px]">
                <p className="text-xs text-primary">
                  <strong>Tip:</strong> You can create more vaults in the application to see them listed here.
                </p>
              </div>
            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#1e1e1e] flex justify-end bg-black">
          <button 
            onClick={onClose}
            className="bg-primary hover:bg-primary text-zinc-950 font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
