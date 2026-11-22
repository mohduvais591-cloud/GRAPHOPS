import React, { useState, useRef } from 'react'

export default function VoiceBrainBar({ onBrainAction, selectedNodeId }) {
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [lastResponse, setLastResponse] = useState(null)
  const [copiedCli, setCopiedCli] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const speak = (text) => {
    if (!window.speechSynthesis || !text) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0
      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('Speech synthesis unavailable:', err)
    }
  }

  const startRecording = async () => {
    try {
      audioChunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        await sendVoiceCommand(audioBlob)
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.warn('Microphone access denied or unsupported:', err)
      setIsRecording(false)
      // Provide fallback prompt
      if (!inputText) {
        setInputText('Simulate compromise on workstation-14 and show choke points')
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const sendVoiceCommand = async (blob) => {
    setIsBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, 'command.webm')
      if (selectedNodeId) formData.append('selected_node_id', selectedNodeId)
      formData.append('transcript_fallback', inputText || 'simulate compromise on workstation-14')

      const res = await fetch('/v1/voice/command', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`Voice command failed: ${res.statusText}`)
      const data = await res.json()
      setLastResponse(data)
      if (data.spoken_reply) speak(data.spoken_reply)
      if (onBrainAction) onBrainAction(data)
    } catch (err) {
      console.error(err)
    } finally {
      setIsBusy(false)
    }
  }

  const handleTextSubmit = async (e) => {
    e?.preventDefault()
    const query = inputText.trim()
    if (!query || isBusy) return

    setIsBusy(true)
    try {
      const res = await fetch('/v1/ai/brain-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          selected_node_id: selectedNodeId,
        }),
      })
      if (!res.ok) throw new Error(`Brain analyze failed: ${res.statusText}`)
      const data = await res.json()
      setLastResponse(data)
      setInputText('')
      if (data.spoken_reply) speak(data.spoken_reply)
      if (onBrainAction) onBrainAction(data)
    } catch (err) {
      console.error(err)
    } finally {
      setIsBusy(false)
    }
  }

  const copyCli = () => {
    if (lastResponse?.containment_cli) {
      navigator.clipboard.writeText(lastResponse.containment_cli)
      setCopiedCli(true)
      setTimeout(() => setCopiedCli(false), 2000)
    }
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E5',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        maxWidth: 720,
        zIndex: 20,
      }}
    >
      {/* Input Row: Hold Mic + Text Box + Send */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          style={{
            background: isRecording ? '#dc2626' : '#111111',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
          title="Press & hold to speak into Groq Whisper Voice Co-Pilot"
        >
          <span>{isRecording ? '🔴' : '🎙️'}</span>
          <span>{isRecording ? 'Listening (Hold)...' : 'Hold Mic (Whisper)'}</span>
        </button>

        <form onSubmit={handleTextSubmit} style={{ flex: 1, display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask Qwen 3 Brain: 'Simulate compromise on workstation-14' or 'Sever choke point'..."
            disabled={isBusy}
            style={{
              flex: 1,
              padding: '7px 12px',
              fontSize: 12.5,
              borderRadius: 6,
              border: '1px solid #D4D4D8',
            }}
          />
          <button
            type="submit"
            disabled={isBusy || !inputText.trim()}
            style={{
              background: isBusy || !inputText.trim() ? '#E4E4E7' : '#111111',
              color: isBusy || !inputText.trim() ? '#A1A1AA' : '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: isBusy || !inputText.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isBusy ? 'Analyzing…' : 'Ask Brain →'}
          </button>
        </form>
      </div>

      {/* Structured Response Card: Intent Badge + Narrative + Containment CLI */}
      {lastResponse && (
        <div
          style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background:
                    lastResponse.intent === 'SIMULATE_COMPROMISE'
                      ? '#FEF2F2'
                      : lastResponse.intent === 'SEVER_EDGE'
                      ? '#FEF3C7'
                      : '#EEF2FF',
                  color:
                    lastResponse.intent === 'SIMULATE_COMPROMISE'
                      ? '#DC2626'
                      : lastResponse.intent === 'SEVER_EDGE'
                      ? '#B45309'
                      : '#4338CA',
                  border: '1px solid currentColor',
                }}
              >
                {lastResponse.intent}
              </span>
              {lastResponse.target_node && (
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                  Target: {lastResponse.target_node}
                </span>
              )}
            </div>
            {lastResponse.spoken_reply && (
              <button
                type="button"
                onClick={() => speak(lastResponse.spoken_reply)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
                title="Replay voice summary"
              >
                🔊
              </button>
            )}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: '#1E293B', lineHeight: 1.4 }}>
            {lastResponse.narrative}
          </p>

          {lastResponse.containment_cli && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#0F172A',
                color: '#38BDF8',
                borderRadius: 5,
                padding: '6px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                marginTop: 2,
              }}
            >
              <span style={{ overflowX: 'auto', whiteSpace: 'nowrap', marginRight: 8 }}>
                $ {lastResponse.containment_cli}
              </span>
              <button
                type="button"
                onClick={copyCli}
                style={{
                  background: '#1E293B',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {copiedCli ? 'Copied ✓' : 'Copy CLI'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
