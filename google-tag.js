(function () {
  const tagId = "AW-18048135651";
  const conversionLabel = "5495CNHNh5McEOPjgp5D";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.MACKLEYAdsConfig = {
    ...(window.MACKLEYAdsConfig || {}),
    tagId,
    conversionLabel,
    conversionTarget: `${tagId}/${conversionLabel}`
  };

  window.gtag("js", new Date());
  window.gtag("config", tagId);
})();
