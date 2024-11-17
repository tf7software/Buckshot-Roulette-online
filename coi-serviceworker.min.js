/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = !1;

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener("message", (e) => {
    if (e.data) {
      if (e.data.type === "deregister") {
        self.registration.unregister()
          .then(() => self.clients.matchAll())
          .then((clients) => {
            clients.forEach((client) => client.navigate(client.url));
          });
      } else if (e.data.type === "coepCredentialless") {
        coepCredentialless = e.data.value;
      }
    }
  });

  self.addEventListener("fetch", (e) => {
    const request = e.request;
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

    // Modify the request if necessary
    const modifiedRequest = coepCredentialless && request.mode === "no-cors" 
      ? new Request(request, { credentials: "omit" }) 
      : request;

    e.respondWith(
      fetch(modifiedRequest)
        .then((response) => {
          if (response.status === 0) return response; // If the status is 0, just return the response as is.

          const headers = new Headers(response.headers);
          headers.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
          if (!coepCredentialless) {
            headers.set("Cross-Origin-Resource-Policy", "cross-origin");
          }
          headers.set("Cross-Origin-Opener-Policy", "same-origin");

          // Only create a new Response with body if it exists.
          if (response.body) {
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            });
          } else {
            // If no body exists, return a Response with no body.
            return new Response(null, {
              status: response.status,
              statusText: response.statusText,
              headers: headers,
            });
          }
        })
        .catch((error) => {
          console.error(error);
        })
    );
  });
} else {
  const coepDegrade = window.sessionStorage.getItem("coiReloadedBySelf") === "coepdegrade";
  window.sessionStorage.removeItem("coiReloadedBySelf");

  const config = {
    shouldRegister: () => !coepDegrade,
    shouldDeregister: () => false,
    coepCredentialless: () => true,
    coepDegrade: () => true,
    doReload: () => window.location.reload(),
    quiet: false,
    ...window.coi,
  };

  const navigatorInstance = navigator;
  const serviceWorkerController = navigatorInstance.serviceWorker && navigatorInstance.serviceWorker.controller;
  if (serviceWorkerController && !window.crossOriginIsolated) {
    window.sessionStorage.setItem("coiCoepHasFailed", "true");
  }

  const coiCoepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

  if (serviceWorkerController) {
    const shouldDegrade = config.coepDegrade() && !(coepDegrade || window.crossOriginIsolated);
    serviceWorkerController.postMessage({
      type: "coepCredentialless",
      value: !(shouldDegrade || coiCoepHasFailed && config.coepDegrade()) && config.coepCredentialless(),
    });

    if (shouldDegrade && !config.quiet) {
      console.log("Reloading page to degrade COEP.");
      window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
      config.doReload();
    }

    if (config.shouldDeregister()) {
      serviceWorkerController.postMessage({ type: "deregister" });
    }
  }

  if (!window.crossOriginIsolated && config.shouldRegister()) {
    if (window.isSecureContext) {
      if (navigatorInstance.serviceWorker) {
        navigatorInstance.serviceWorker.register(window.document.currentScript.src)
          .then((registration) => {
            if (!config.quiet) {
              console.log("COOP/COEP Service Worker registered", registration.scope);
            }

            registration.addEventListener("updatefound", () => {
              if (!config.quiet) {
                console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
              }
              window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
              config.doReload();
            });

            if (registration.active && !navigatorInstance.serviceWorker.controller) {
              if (!config.quiet) {
                console.log("Reloading page to make use of COOP/COEP Service Worker.");
              }
              window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
              config.doReload();
            }
          })
          .catch((error) => {
            if (!config.quiet) {
              console.error("COOP/COEP Service Worker failed to register:", error);
            }
          });
      } else if (!config.quiet) {
        console.log("COOP/COEP Service Worker not registered, perhaps due to private mode.");
      }
    } else if (!config.quiet) {
      console.log("COOP/COEP Service Worker not registered, a secure context is required.");
    }
  }
}
