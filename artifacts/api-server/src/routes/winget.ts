import { Router, type IRouter } from "express";
import { SearchWingetQueryParams, SearchWingetResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const WINGET_API_BASE = "https://winget.run/api/v2/packages";

router.get("/winget/search", async (req, res): Promise<void> => {
  const parsed = SearchWingetQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { q, limit = 30 } = parsed.data;

  try {
    const url = `${WINGET_API_BASE}?query=${encodeURIComponent(q)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "winget-repo-dashboard/1.0",
      },
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "winget.run API returned non-OK");
      res.status(502).json({ error: "Upstream Winget API error" });
      return;
    }

    const raw = await response.json() as { Packages?: unknown[] };
    const packages = raw?.Packages ?? [];

    const mapped = (packages as Array<Record<string, unknown>>).map((pkg) => ({
      packageId: `${pkg["Id"] ?? ""}`,
      name: `${pkg["Name"] ?? ""}`,
      publisher: `${pkg["Publisher"] ?? ""}`,
      version: `${pkg["Latest"]?.toString() ?? pkg["Version"]?.toString() ?? ""}`,
      description: pkg["Description"] ? `${pkg["Description"]}` : null,
      license: pkg["License"] ? `${pkg["License"]}` : null,
      homepage: pkg["Homepage"] ? `${pkg["Homepage"]}` : null,
    }));

    res.json(SearchWingetResponse.parse(mapped));
  } catch (err) {
    req.log.error({ err }, "Error fetching from winget.run");
    res.status(502).json({ error: "Failed to reach upstream Winget API" });
  }
});

export default router;
