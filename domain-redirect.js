(function () {
  const redirectHosts = new Set(["whoismackley.com", "www.whoismackley.com", "www.mackley.co"]);
  const canonicalHost = "mackley.co";

  if (!redirectHosts.has(window.location.hostname)) return;

  const nextUrl = new URL(window.location.href);
  nextUrl.hostname = canonicalHost;
  nextUrl.protocol = "https:";
  window.location.replace(nextUrl.toString());
})();
