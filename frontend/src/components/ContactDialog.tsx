import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, sendContactForm } from '@/lib/api'

type Field = 'name' | 'email' | 'message'
const EMPTY = { name: '', email: '', message: '', website: '' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(form: typeof EMPTY): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  if (!form.name.trim()) errors.name = 'Please enter your name'
  if (!form.email.trim()) errors.email = 'Please enter your email'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address'
  if (form.message.trim().length < 5) errors.message = 'Message is too short'
  else if (form.message.length > 2000) errors.message = 'Message is too long (max 2000 characters)'
  return errors
}

export function ContactDialog({
  open,
  onOpenChange,
  ownerName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerName: string
}) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [sending, setSending] = useState(false)

  // An error disappears as soon as the visitor edits that field.
  const update = (field: keyof typeof EMPTY, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (field !== 'website' && errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    setSending(true)
    try {
      await sendContactForm({ ...form, name: form.name.trim(), email: form.email.trim(), message: form.message.trim() })
      toast.success(`Message sent — ${ownerName} will get back to you soon.`)
      setForm(EMPTY)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not send your message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const fieldError = (field: Field) =>
    errors[field] && <p className="text-xs text-destructive">{errors[field]}</p>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Message {ownerName}</DialogTitle>
            <DialogDescription>It goes straight to my inbox — I usually reply within a day.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              placeholder="Your name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              aria-invalid={!!errors.name}
              autoComplete="name"
            />
            {fieldError('name')}
          </div>
          <div className="space-y-1.5">
            <Input
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              aria-invalid={!!errors.email}
              autoComplete="email"
            />
            {fieldError('email')}
          </div>
          <div className="space-y-1.5">
            <Textarea
              placeholder="What would you like to talk about?"
              rows={5}
              value={form.message}
              onChange={(e) => update('message', e.target.value)}
              aria-invalid={!!errors.message}
            />
            {fieldError('message')}
          </div>
          {/* Honeypot: invisible to people, irresistible to bots. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            className="hidden"
            aria-hidden="true"
          />
          <DialogFooter>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send message
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
