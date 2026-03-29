import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,28rem)] border-[var(--nv-border)] bg-[var(--nv-surface-strong)] text-[var(--nv-foreground)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[1.05rem] font-bold text-[var(--nv-secondary)]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-[var(--nv-muted)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-[var(--nv-border)] bg-transparent text-[var(--nv-muted)] hover:border-[var(--nv-primary)] hover:bg-[var(--nv-surface)] hover:text-[var(--nv-foreground)]">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-[var(--nv-danger-soft)] text-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] hover:opacity-90 hover:text-[var(--nv-danger)]"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
