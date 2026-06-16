(function () {
  const redirectHosts = new Set(["mackley.co", "www.mackley.co"]);
  const canonicalHost = "whoismackley.com";

  if (!redirectHosts.has(window.location.hostname)) return;

  const nextUrl = new URL(window.location.href);
  nextUrl.hostname = canonicalHost;
  nextUrl.protocol = "https:";
  window.location.replace(nextUrl.toString());
})();
