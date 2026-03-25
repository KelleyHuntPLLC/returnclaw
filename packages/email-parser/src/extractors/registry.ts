import { BaseOrderExtractor } from './base';
import { AmazonOrderExtractor } from './amazon';
import { WalmartOrderExtractor } from './walmart';
import { TargetOrderExtractor } from './target';
import { BestBuyOrderExtractor } from './bestbuy';
import { GenericOrderExtractor } from './generic';

export class ExtractorRegistry {
  private readonly extractors: BaseOrderExtractor[] = [];
  private readonly genericExtractor: GenericOrderExtractor;

  constructor(openaiApiKey?: string) {
    // Register all built-in extractors
    this.extractors.push(new AmazonOrderExtractor());
    this.extractors.push(new WalmartOrderExtractor());
    this.extractors.push(new TargetOrderExtractor());
    this.extractors.push(new BestBuyOrderExtractor());

    // Initialize the generic (LLM-based) fallback extractor
    this.genericExtractor = new GenericOrderExtractor(openaiApiKey);
  }

  /**
   * Returns the first registered extractor that can handle the given sender email.
   * Falls back to the GenericOrderExtractor if no specialized extractor matches.
   */
  getExtractor(senderEmail: string): BaseOrderExtractor {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(senderEmail)) {
        return extractor;
      }
    }
    return this.genericExtractor;
  }

  /**
   * Register an additional extractor.
   * Custom extractors are added at the end of the list (checked after built-ins).
   */
  registerExtractor(extractor: BaseOrderExtractor): void {
    this.extractors.push(extractor);
  }

  /**
   * Returns a read-only view of all registered extractors (excluding the generic fallback).
   */
  getRegisteredExtractors(): ReadonlyArray<BaseOrderExtractor> {
    return this.extractors;
  }
}
