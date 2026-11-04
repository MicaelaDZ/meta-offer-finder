
import fs from "node:fs/promises";

const destinations = [
  {
    advertiser: "Business Explained",
    url: "https://business-explained.com/shop/everything-explained-bundle/",
    type: "possible_paid_ebook",
  },
  {
    advertiser: "Richard Glenn Ministries",
    url: "https://www.amazon.com/Mystery-Iniquity-2nd-Richard-Glenn-ebook/dp/B09G2K5PF4",
    type: "possible_paid_ebook",
  },
  {
    advertiser: "Thermo Fisher Scientific",
    url: "https://documents.thermofisher.com/TFS-Assets/GSD/Reference-Materials/qPCR-dPCR-Multiplexing-eBook.pdf",
    type: "direct_pdf",
  },
  {
    advertiser: "Ease.io",
    url: "https://www.ease.io/resources/cost-of-quality/",
    type: "unknown",
  },
  {
    advertiser: "Treatmedy",
    url: "https://shop.treatmedy.com/bunion/ps-2-50",
    type: "physical_product",
  },
];

await fs.mkdir("data", {
  recursive: true,
});

await fs.writeFile(
  "data/destinations.json",
  JSON.stringify(destinations, null, 2),
  "utf8"
);

console.log(
  `✅ ${destinations.length} destinos guardados.`
);
