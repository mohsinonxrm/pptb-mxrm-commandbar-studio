# Microsoft's ribbon schemas (#126)

The publish dialog checks the RibbonDiffXml each publish would import against these
schemas. A schema finding is always a **warning**: these files are from 2017, and Dataverse
accepts ribbon XML they don't describe. What Dataverse accepts decides.

| File | SHA-256 |
| --- | --- |
| `RibbonCore.xsd` | `2bc76603e8c164cd23ab02ff2365a891aa6e7def1dbf47a6a77ff6f90863d6e5` |
| `RibbonTypes.xsd` | `1ecd255c01bdf136d105dd695c4fb8b4d111a11f42a3f8422a9a566aebba457b` |
| `RibbonWSS.xsd` | `8f0dc511233059b38a6ab5cb9dc093b16060f023e172626fd9d8dcf64e04bc36` |

- **Source:** Microsoft's [Schemas download](https://download.microsoft.com/download/B/9/7/B97655A4-4E46-4E51-BA0A-C669106D563F/Schemas.zip)
  (`Schemas.zip`, SHA-256 `72695511e286cbd7f4c07b70bac76720f125a6b1b746b2d2db487ce075f085bf`),
  folder `9.0.0.2090`, linked from
  [Edit the customizations XML file with schema validation](https://learn.microsoft.com/power-apps/developer/model-driven-apps/edit-customizations-xml-file-schema-validation).
- **Version:** 9.0.0.2090 (files dated October 2017).
- **Unchanged:** the three files are byte for byte as in the download, CRLF line endings and
  byte order mark included (`.gitattributes` keeps them that way).
- `CbsEntityRibbon.xsd` is CBS's own: an entity's `<RibbonDiffXml>` has the type
  `RibbonEntityDiffXmlType`, which RibbonCore.xsd declares but doesn't give a root element.
  The wrapper gives it one, so an entity's layer is checked against that type and the
  application ribbon's against the `RibbonDiffXml` root element.

To update: download `Schemas.zip`, replace the three files from its newest folder, update this
table and the version, and run `npx vitest run src/__tests__/ribbonXsd126.test.ts`.
