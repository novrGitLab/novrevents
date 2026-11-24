'use client'

import jsQR from 'jsqr'
import { Camera, CameraOff } from 'lucide-react'
import * as React from 'react'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'

/**
 * Camera QR reader. Uses the browser's BarcodeDetector where available and falls back to jsQR, so it
 * works in Chrome, Safari and Firefox on phones and laptops. Decoding happens entirely in the
 * browser; only the decoded text is sent to the API for validation.
 */
export function QrScanner({ onScan, paused }: { onScan: (payload: string) => void; paused: boolean }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const lastRef = React.useRef<{ value: string; at: number } | null>(null)
  const pausedRef = React.useRef(paused)
  const [active, setActive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  React.useEffect(() => stop, [stop])

  const start = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot use the camera. Use manual check-in below.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setActive(true)
      void loop()
    } catch (caught) {
      const name = (caught as { name?: string }).name
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow camera access for this site in your browser settings.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'The camera could not be started. Camera access requires HTTPS (or localhost).',
      )
    }
  }

  const loop = async () => {
    type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }
    const DetectorClass = (
      globalThis as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }
    ).BarcodeDetector
    let detector: Detector | null = null
    try {
      detector = DetectorClass ? new DetectorClass({ formats: ['qr_code'] }) : null
    } catch {
      detector = null
    }
    const tick = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!streamRef.current || !video || !canvas) return
      if (!pausedRef.current && video.readyState >= 2) {
        let value: string | null = null
        if (detector) {
          const codes = await detector.detect(video).catch(() => [])
          value = codes[0]?.rawValue ?? null
        } else {
          const width = video.videoWidth
          const height = video.videoHeight
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (context && width > 0) {
            context.drawImage(video, 0, 0, width, height)
            const image = context.getImageData(0, 0, width, height)
            value = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
          }
        }
        // Ignore the same code for a few seconds so one ticket held in front of the camera is one scan.
        const now = Date.now()
        if (value && (lastRef.current?.value !== value || now - lastRef.current.at > 4000)) {
          lastRef.current = { value, at: now }
          onScan(value)
        }
      }
      requestAnimationFrame(() => void tick())
    }
    void tick()
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-lg bg-black sm:aspect-video">
        <video
          ref={videoRef}
          className="size-full object-cover"
          playsInline
          muted
          aria-label="Camera preview"
        />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white/80">
            <Camera className="size-8" aria-hidden />
            Start the camera and point it at a ticket QR code.
          </div>
        )}
        {active && (
          <div
            className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/70"
            aria-hidden
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {active ? (
        <Button variant="outline" onClick={stop}>
          <CameraOff /> Stop camera
        </Button>
      ) : (
        <Button onClick={() => void start()}>
          <Camera /> Start camera
        </Button>
      )}
    </div>
  )
}
