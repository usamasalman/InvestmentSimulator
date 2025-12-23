// AI Recommendation Engine - Personalized Stock Picks

import { Stock, tadawulStocks, tadawulSectors } from '@/data/tadawulStocks';
import { UserProfile, AIRecommendation, PortfolioSummary, getRiskLevelFromScore } from '@/types/profile';

interface ScoredStock extends Stock {
  totalScore: number;
  riskScore: number;
  valueScore: number;
  dividendScore: number;
  momentumScore: number;
  sectorMatchScore: number;
  roiFitScore: number;
  expectedReturnEstimate: number;
}

// Calculate risk score based on beta and volatility
const calculateRiskScore = (stock: Stock, userRisk: number): number => {
  const beta = stock.beta || 1;
  const userPrefersBeta = userRisk / 50; // 0-2 range based on risk tolerance
  
  // Lower difference = higher score
  const betaDiff = Math.abs(beta - userPrefersBeta);
  const score = Math.max(0, 100 - (betaDiff * 50));
  
  return score;
};

// Calculate value score based on P/E ratio
const calculateValueScore = (stock: Stock): number => {
  if (!stock.peRatio || stock.peRatio <= 0) return 30; // Neutral for missing data
  
  if (stock.peRatio < 10) return 95;
  if (stock.peRatio < 15) return 85;
  if (stock.peRatio < 20) return 70;
  if (stock.peRatio < 30) return 50;
  if (stock.peRatio < 50) return 30;
  return 15;
};

// Calculate dividend score
const calculateDividendScore = (stock: Stock, prioritizeDividends: boolean): number => {
  const yield_ = stock.dividendYield || 0;
  const multiplier = prioritizeDividends ? 1.5 : 1;
  
  if (yield_ >= 7) return Math.min(100, 95 * multiplier);
  if (yield_ >= 5) return Math.min(100, 80 * multiplier);
  if (yield_ >= 3) return Math.min(100, 65 * multiplier);
  if (yield_ >= 1) return Math.min(100, 45 * multiplier);
  return 20;
};

// Calculate momentum score
const calculateMomentumScore = (stock: Stock): number => {
  const change = stock.changePercent;
  
  if (change > 3) return 95;
  if (change > 2) return 85;
  if (change > 1) return 75;
  if (change > 0) return 60;
  if (change > -1) return 45;
  if (change > -2) return 30;
  return 15;
};

// Calculate sector match score
const calculateSectorMatchScore = (stock: Stock, preferredSectors: string[]): number => {
  if (preferredSectors.length === 0) return 70; // Neutral if no preference
  
  if (preferredSectors.includes(stock.sectorId)) {
    return 100;
  }
  return 40; // Still viable but lower priority
};

// Score all stocks based on profile
const scoreStocks = (profile: UserProfile): ScoredStock[] => {
  const prioritizeDividends =
    profile.investmentGoal === 'income' || profile.investmentGoal === 'capital_preservation';

  // Apply max price filter (if provided)
  const universe = tadawulStocks.filter((s) =>
    Number.isFinite(profile.maxPricePerStock) ? s.price <= profile.maxPricePerStock : true
  );

  // If filter becomes too strict, fall back to full universe
  const candidateStocks = universe.length >= 10 ? universe : tadawulStocks;

  return candidateStocks.map((stock) => {
    const riskScore = calculateRiskScore(stock, profile.riskTolerance);
    const valueScore = calculateValueScore(stock);
    const dividendScore = calculateDividendScore(stock, prioritizeDividends);
    const momentumScore = calculateMomentumScore(stock);
    const sectorMatchScore = calculateSectorMatchScore(stock, profile.preferredSectors);

    // ROI fit (closer to desired ROI gets higher score)
    const expectedReturnEstimate = estimateExpectedReturn(stock as ScoredStock, profile);
    const roiDiff = Math.abs(expectedReturnEstimate - profile.desiredROI);
    const roiFitScore = Math.max(0, Math.min(100, 100 - roiDiff * 6));

    // Weighted scoring based on investment goal
    let weights = {
      risk: 0.2,
      value: 0.2,
      dividend: 0.2,
      momentum: 0.2,
      sector: 0.2,
      roi: 0.0,
    };

    switch (profile.investmentGoal) {
      case 'capital_preservation':
        weights = { risk: 0.35, value: 0.25, dividend: 0.2, momentum: 0.05, sector: 0.1, roi: 0.05 };
        break;
      case 'income':
        weights = { risk: 0.2, value: 0.15, dividend: 0.4, momentum: 0.05, sector: 0.15, roi: 0.05 };
        break;
      case 'balanced':
        weights = { risk: 0.2, value: 0.25, dividend: 0.2, momentum: 0.15, sector: 0.15, roi: 0.05 };
        break;
      case 'growth':
        weights = { risk: 0.15, value: 0.2, dividend: 0.1, momentum: 0.35, sector: 0.1, roi: 0.1 };
        break;
      case 'aggressive_growth':
        weights = { risk: 0.1, value: 0.15, dividend: 0.05, momentum: 0.45, sector: 0.1, roi: 0.15 };
        break;
    }

    const totalScore =
      riskScore * weights.risk +
      valueScore * weights.value +
      dividendScore * weights.dividend +
      momentumScore * weights.momentum +
      sectorMatchScore * weights.sector +
      roiFitScore * weights.roi;

    return {
      ...stock,
      totalScore,
      riskScore,
      valueScore,
      dividendScore,
      momentumScore,
      sectorMatchScore,
      roiFitScore,
      expectedReturnEstimate,
    };
  });
};

// Generate reasoning for a stock pick
const generateReasoning = (stock: ScoredStock, profile: UserProfile): string[] => {
  const reasons: string[] = [];
  
  // Risk analysis
  if (stock.riskScore >= 75) {
    reasons.push(`Risk profile matches your ${getRiskLevelFromScore(profile.riskTolerance)} risk tolerance with beta of ${stock.beta?.toFixed(2) || 'N/A'}`);
  }
  
  // Value analysis
  if (stock.peRatio && stock.peRatio < 15) {
    reasons.push(`Undervalued with P/E ratio of ${stock.peRatio.toFixed(1)} - below market average`);
  } else if (stock.peRatio && stock.peRatio < 25) {
    reasons.push(`Fair valuation with P/E ratio of ${stock.peRatio.toFixed(1)}`);
  }
  
  // Dividend analysis
  if (stock.dividendYield && stock.dividendYield >= 5) {
    reasons.push(`Excellent dividend yield of ${stock.dividendYield.toFixed(1)}% supports your income goals`);
  } else if (stock.dividendYield && stock.dividendYield >= 3) {
    reasons.push(`Solid dividend yield of ${stock.dividendYield.toFixed(1)}% provides steady income`);
  }
  
  // Momentum analysis
  if (stock.changePercent > 2) {
    reasons.push(`Strong positive momentum with ${stock.changePercent.toFixed(1)}% recent gain`);
  } else if (stock.changePercent > 0) {
    reasons.push(`Positive price trend with ${stock.changePercent.toFixed(1)}% recent performance`);
  }
  
  // Sector preference
  if (profile.preferredSectors.includes(stock.sectorId)) {
    const sector = tadawulSectors.find(s => s.id === stock.sectorId);
    reasons.push(`Aligns with your preferred ${sector?.name || stock.sector} sector`);
  }
  
  // Market cap stability
  if (stock.marketCap.includes('T')) {
    reasons.push('Mega-cap company with strong market stability');
  } else if (stock.marketCap.includes('B')) {
    const capNum = parseFloat(stock.marketCap);
    if (capNum >= 50) {
      reasons.push('Large-cap company with established market presence');
    }
  }
  
  return reasons.length > 0 ? reasons : ['Selected based on overall portfolio optimization'];
};

// Generate profile fit explanation
const generateProfileFitExplanation = (stock: ScoredStock, profile: UserProfile): string => {
  const riskLevel = getRiskLevelFromScore(profile.riskTolerance);
  const parts: string[] = [];
  
  if (stock.sectorMatchScore >= 80) {
    parts.push('sector aligned');
  }
  
  if (stock.riskScore >= 70) {
    parts.push(`${riskLevel}-risk profile match`);
  }
  
  if (profile.investmentGoal === 'income' && stock.dividendScore >= 70) {
    parts.push('income-generating');
  }
  
  if (profile.investmentGoal === 'growth' && stock.momentumScore >= 70) {
    parts.push('growth potential');
  }
  
  const expectedReturn = estimateExpectedReturn(stock, profile);
  if (expectedReturn >= profile.desiredROI * 0.8) {
    parts.push(`projected ${expectedReturn.toFixed(0)}% annual return`);
  }
  
  return parts.length > 0 
    ? `This stock is ideal for your portfolio: ${parts.join(', ')}.`
    : 'Selected for portfolio diversification and risk-adjusted returns.';
};

// Estimate expected return based on stock metrics
const estimateExpectedReturn = (stock: ScoredStock, profile: UserProfile): number => {
  const dividendYield = stock.dividendYield || 0;
  const momentumBonus = stock.changePercent > 0 ? stock.changePercent * 2 : 0;
  
  // Base return estimate
  let baseReturn = dividendYield + 5; // Dividend + average market growth
  
  // Adjust based on momentum and value
  if (stock.peRatio && stock.peRatio < 15) {
    baseReturn += 3; // Value stocks tend to appreciate
  }
  
  baseReturn += momentumBonus;
  
  // Risk adjustment
  const beta = stock.beta || 1;
  baseReturn *= beta;
  
  return Math.min(35, Math.max(2, baseReturn));
};

// Generate risk analysis
const generateRiskAnalysis = (stock: ScoredStock): string => {
  const beta = stock.beta || 1;
  const volatilityLevel = beta > 1.2 ? 'high' : beta > 0.8 ? 'moderate' : 'low';
  
  let analysis = `Beta: ${beta.toFixed(2)} (${volatilityLevel} volatility). `;
  
  if (stock.peRatio) {
    if (stock.peRatio > 30) {
      analysis += 'Elevated valuation presents risk of correction. ';
    } else if (stock.peRatio < 10) {
      analysis += 'Low valuation suggests value opportunity but investigate fundamentals. ';
    }
  }
  
  if (stock.changePercent < -2) {
    analysis += 'Recent negative momentum - consider averaging in. ';
  }
  
  return analysis.trim();
};

// Small seeded RNG so "Refresh" can produce different picks while staying stable for a given seed
const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleInPlace = <T,>(arr: T[], rand: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Calculate portfolio allocation
const calculateAllocation = (
  scoredStocks: ScoredStock[],
  profile: UserProfile,
  maxStocks: number = 5,
  seed: number = Date.now()
): AIRecommendation[] => {
  // Sort by score then shuffle within the top band to avoid the exact same picks every time
  const sorted = [...scoredStocks].sort((a, b) => b.totalScore - a.totalScore);
  const topBand = sorted.slice(0, 35);
  const rand = mulberry32(seed);
  shuffleInPlace(topBand, rand);

  const selected: ScoredStock[] = [];
  const usedSectors = new Set<string>();
  const hasPreferredSectors = profile.preferredSectors.length > 0;

  // First pass: pick top stock from each preferred sector
  for (const sectorId of profile.preferredSectors) {
    if (selected.length >= maxStocks) break;
    const sectorStock = topBand.find((s) => s.sectorId === sectorId && !usedSectors.has(s.sectorId));
    if (sectorStock) {
      selected.push(sectorStock);
      usedSectors.add(sectorStock.sectorId);
    }
  }

  // If user has preferred sectors, fill remaining slots ONLY from those sectors
  if (hasPreferredSectors) {
    // Second pass: add more stocks from preferred sectors (allow overlap)
    for (const sectorId of profile.preferredSectors) {
      for (const stock of topBand) {
        if (selected.length >= maxStocks) break;
        if (!selected.includes(stock) && stock.sectorId === sectorId) {
          selected.push(stock);
        }
      }
      if (selected.length >= maxStocks) break;
    }
  } else {
    // No preferred sectors: fill with best remaining stocks (diversified)
    for (const stock of topBand) {
      if (selected.length >= maxStocks) break;
      if (!selected.includes(stock) && !usedSectors.has(stock.sectorId)) {
        selected.push(stock);
        usedSectors.add(stock.sectorId);
      }
    }

    // Third pass: if still need more, allow sector overlap
    for (const stock of topBand) {
      if (selected.length >= maxStocks) break;
      if (!selected.includes(stock)) {
        selected.push(stock);
      }
    }
  }

  // Calculate allocations based on scores
  const totalScore = selected.reduce((sum, s) => sum + s.totalScore, 0);

  return selected.map((stock) => {
    const allocationPercent = (stock.totalScore / totalScore) * 100;
    const investmentAmount = (profile.capital * allocationPercent) / 100;
    const suggestedShares = Math.floor(investmentAmount / stock.price);
    const actualInvestment = suggestedShares * stock.price;

    return {
      id: `rec-${stock.ticker}-${seed}`,
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      sectorId: stock.sectorId,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      dividendYield: stock.dividendYield,
      peRatio: stock.peRatio,
      marketCap: stock.marketCap,
      beta: stock.beta,

      aiScore: Math.round(stock.totalScore),
      matchScore: Math.round((stock.riskScore + stock.sectorMatchScore + stock.roiFitScore) / 3),
      suggestedAllocation: Math.round(allocationPercent * 10) / 10,
      suggestedShares,
      investmentAmount: actualInvestment,
      expectedReturn: estimateExpectedReturn(stock, profile),
      reasoning: generateReasoning(stock, profile),
      riskAnalysis: generateRiskAnalysis(stock),
      profileFitExplanation: generateProfileFitExplanation(stock, profile),
    };
  });
};

// Main function to generate recommendations
export const generateRecommendations = (
  profile: UserProfile,
  count: number = 5,
  seed: number = Date.now()
): PortfolioSummary => {
  const scoredStocks = scoreStocks(profile);
  const recommendations = calculateAllocation(scoredStocks, profile, count, seed);

  // Calculate portfolio summary
  const totalInvestment = recommendations.reduce((sum, r) => sum + r.investmentAmount, 0);
  const weightedReturn = recommendations.reduce(
    (sum, r) => sum + (r.expectedReturn * r.suggestedAllocation / 100),
    0
  );
  const dividendIncome = recommendations.reduce((sum, r) => {
    const yield_ = r.dividendYield || 0;
    return sum + (r.investmentAmount * yield_ / 100);
  }, 0);

  // Sector diversification
  const sectorMap = new Map<string, number>();
  recommendations.forEach((r) => {
    const current = sectorMap.get(r.sector) || 0;
    sectorMap.set(r.sector, current + r.suggestedAllocation);
  });

  const sectorDiversification = Array.from(sectorMap.entries())
    .map(([sector, percentage]) => ({ sector, percentage }))
    .sort((a, b) => b.percentage - a.percentage);

  return {
    totalInvestment,
    stockCount: recommendations.length,
    expectedAnnualReturn: weightedReturn,
    dividendIncome,
    riskLevel: getRiskLevelFromScore(profile.riskTolerance),
    sectorDiversification,
    recommendations,
  };
};

// Export utility functions
export { estimateExpectedReturn };
