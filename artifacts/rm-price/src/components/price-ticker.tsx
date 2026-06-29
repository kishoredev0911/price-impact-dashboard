import { useState } from "react";
import { type RmIndex } from "@/lib/pricing";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceTickerProps {
  alloys: string[];
  rm: RmIndex;
  quarters: string[];
}

export function PriceTicker({ alloys, rm, quarters }: PriceTickerProps) {
  const displayAlloys = [...alloys, "SCRAP"];

  // Prepare quarterly trends for each alloy
  const tickerItems = displayAlloys.map((alloy) => {
    const quarterData = quarters.map((q, idx) => {
      const currentPrice = rm[alloy]?.[q] ?? null;
      const prevQKey = idx > 0 ? quarters[idx - 1] : null;
      const prevPrice = prevQKey ? (rm[alloy]?.[prevQKey] ?? null) : null;

      let changePct: number | null = null;
      let trend: "up" | "down" | "flat" | "none" = "none";

      if (currentPrice != null && prevPrice != null && prevPrice !== 0) {
        const diff = currentPrice - prevPrice;
        changePct = (diff / prevPrice) * 100;
        if (diff > 0.001) trend = "up";
        else if (diff < -0.001) trend = "down";
        else trend = "flat";
      }

      return {
        quarter: q,
        price: currentPrice,
        changePct,
        trend,
      };
    });

    return {
      alloy,
      quarterData,
    };
  });

  return (
    <div className="w-full bg-card border-b border-border overflow-hidden select-none py-2 relative z-30">
      {/* Shadow gradient overlays for a premium visual depth effect on edges */}
      <div className="absolute top-0 left-0 w-20 h-full bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 right-0 w-20 h-full bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
      
      <div className="flex w-max">
        {/* Render duplicate items for infinite seamless scroll */}
        <div className="flex animate-marquee gap-8 pr-8 items-center">
          {tickerItems.map((item, idx) => (
            <AlloyTickerCard key={`${item.alloy}-${idx}`} item={item} />
          ))}
        </div>
        <div className="flex animate-marquee gap-8 pr-8 items-center" aria-hidden="true">
          {tickerItems.map((item, idx) => (
            <AlloyTickerCard key={`${item.alloy}-clone-${idx}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TickerItem {
  alloy: string;
  quarterData: {
    quarter: string;
    price: number | null;
    changePct: number | null;
    trend: "up" | "down" | "flat" | "none";
  }[];
}

function AlloyTickerCard({ item }: { item: TickerItem }) {
  const isScrap = item.alloy === "SCRAP";

  return (
    <div className="flex items-center bg-card hover:bg-accent border border-border/80 rounded-full px-4 py-1.5 shadow-sm space-x-3 shrink-0 transition-all duration-200">
      <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider ${
        isScrap 
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900" 
          : "bg-primary/10 text-primary border border-primary/20"
      }`}>
        {item.alloy}
      </span>
      <div className="flex items-center space-x-3.5 divide-x divide-border">
        {item.quarterData.map((qData, idx) => {
          const formattedPrice = qData.price != null ? `₹${qData.price.toFixed(2)}` : "—";
          return (
            <div key={qData.quarter} className={`flex items-center space-x-1.5 ${idx > 0 ? "pl-3.5" : ""}`}>
              <span className="text-muted-foreground font-mono text-[10px] tracking-tight">{qData.quarter}</span>
              <span className="font-semibold text-foreground tabular-nums text-xs">{formattedPrice}</span>
              
              {qData.trend === "up" && qData.changePct !== null && (
                <span className="text-emerald-600 flex items-center text-[10px] font-bold">
                  <TrendingUp className="size-3 text-emerald-500 mr-0.5 shrink-0" />
                  +{qData.changePct.toFixed(1)}%
                </span>
              )}
              {qData.trend === "down" && qData.changePct !== null && (
                <span className="text-destructive flex items-center text-[10px] font-bold">
                  <TrendingDown className="size-3 text-destructive mr-0.5 shrink-0" />
                  {qData.changePct.toFixed(1)}%
                </span>
              )}
              {qData.trend === "flat" && (
                <span className="text-muted-foreground flex items-center text-[10px] font-semibold">
                  <Minus className="size-2 text-muted-foreground mr-0.5 shrink-0" />
                  0%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
