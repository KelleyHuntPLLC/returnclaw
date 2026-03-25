import { NextResponse } from "next/server";

/**
 * POST /api/voice/token
 *
 * Generates an ephemeral token for the OpenAI Realtime API.
 * This token is short-lived and scoped to the current user's session.
 */
export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Request an ephemeral token from OpenAI Realtime API
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2025-06-03",
          voice: "alloy",
          instructions: `You are ReturnClaw, a helpful voice-first AI assistant that helps users with online returns.

You can:
- Initiate returns by identifying orders from the user's purchase history
- Look up return policies for any retailer
- Generate return shipping labels
- Schedule carrier pickups (UPS, FedEx, USPS)
- Find nearby drop-off locations
- Track return shipments and refund status

Be concise and action-oriented. When a user wants to return something:
1. Identify the order
2. Check the return policy
3. Confirm the return details
4. Generate the label and offer pickup scheduling

Always confirm amounts and actions before executing.`,
          input_audio_transcription: {
            model: "whisper-1",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI Realtime session error:", error);
      return NextResponse.json(
        { error: "Failed to create voice session" },
        { status: 502 }
      );
    }

    const session = await response.json();

    return NextResponse.json({
      token: session.client_secret?.value || session.id,
      expires_at: new Date(Date.now() + 60 * 1000).toISOString(), // 60s expiry
      session_id: session.id,
    });
  } catch (error) {
    console.error("Voice token generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
