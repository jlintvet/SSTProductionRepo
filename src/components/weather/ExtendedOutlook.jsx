// src/components/weather/ExtendedOutlook.jsx
// Renders forecast cards beyond the first 3, inside a collapsible "Extended
// Outlook" section. Defaults to closed — the drawer is narrow and most users
// only need the immediate forecast on first glance. Click to expand for the
// 5-day view.

import React from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ForecastCard from "@/components/weather/ForecastCard";

export default function ExtendedOutlook({ forecasts, nwsForecast, tideData, sunData, forecastHourlyUrl }) {
  const cards = forecasts?.slice(3) ?? [];
  if (!cards.length) return null;

  return (
    <Collapsible defaultOpen={false} className="space-y-3">
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-600 transition-colors group">
        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        Extended Outlook
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3">
          {cards.map((forecast, index) => (
            <ForecastCard
              key={index + 3}
              forecast={forecast}
              dayOffset={index + 3}
              badgeLabel={`+${index + 3}`}
              nwsForecast={nwsForecast}
              tideData={tideData}
              sunData={sunData}
              forecastHourlyUrl={forecastHourlyUrl}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}