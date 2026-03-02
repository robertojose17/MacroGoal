
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("[CheckoutRedirect] ✅ Edge Function initialized");

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[CheckoutRedirect] 📥 Processing redirect...");
    
    const url = new URL(req.url);
    const success = url.searchParams.get("success");
    const cancelled = url.searchParams.get("cancelled");
    const sessionId = url.searchParams.get("session_id");

    console.log("[CheckoutRedirect] Params:", { success, cancelled, sessionId });

    // Build deep link URL
    let deepLinkUrl = "elitemacrotracker://";
    
    if (success === "true") {
      console.log("[CheckoutRedirect] ✅ Checkout successful, redirecting to app...");
      deepLinkUrl += `profile?subscription_success=true&session_id=${sessionId || ''}`;
    } else if (cancelled === "true") {
      console.log("[CheckoutRedirect] ❌ Checkout cancelled, redirecting to paywall...");
      deepLinkUrl += "paywall?subscription_cancelled=true";
    } else {
      console.log("[CheckoutRedirect] ⚠️ Unknown redirect type");
      deepLinkUrl += "profile";
    }

    console.log("[CheckoutRedirect] 🔗 Deep link URL:", deepLinkUrl);

    // Return HTML that redirects to the deep link
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Redirecting...</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #0F4C81 0%, #1e3a8a 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 10px;
            }
            p {
              font-size: 16px;
              opacity: 0.9;
              margin-bottom: 30px;
            }
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.3);
              border-top: 3px solid white;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .fallback {
              margin-top: 30px;
              font-size: 14px;
              opacity: 0.8;
            }
            .fallback a {
              color: white;
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">${success === "true" ? "🎉" : cancelled === "true" ? "❌" : "🔄"}</div>
            <h1>${success === "true" ? "Payment Successful!" : cancelled === "true" ? "Checkout Cancelled" : "Redirecting..."}</h1>
            <p>${success === "true" ? "Returning to the app..." : cancelled === "true" ? "Returning to the app..." : "Please wait..."}</p>
            <div class="spinner"></div>
            <div class="fallback">
              <p>If you're not redirected automatically, <a href="${deepLinkUrl}">click here</a></p>
            </div>
          </div>
          <script>
            // Attempt to redirect to the app
            window.location.href = "${deepLinkUrl}";
            
            // Fallback: close the window after a delay
            setTimeout(function() {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("[CheckoutRedirect] ❌ Error:", error);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
