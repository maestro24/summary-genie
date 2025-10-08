/**
 * SummaryGenie Stripe Service
 * Stripe 결제 및 구독 관리를 담당하는 서비스 모듈
 */

const Stripe = require('stripe');

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });
    
    // 가격 플랜 ID (Stripe Dashboard에서 생성 후 설정)
    this.priceIds = {
      pro: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly',
      team: process.env.STRIPE_PRICE_TEAM || 'price_team_monthly',
      pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly',
      team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || 'price_team_yearly'
    };
    
    // 웹훅 시크릿
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }
  
  /**
   * 구독 플랜 초기화 (서버 시작시 한번 실행)
   * Stripe Dashboard에 프로덕트와 가격이 없으면 생성
   */
  async initializePlans() {
    try {
      // Pro 플랜 체크/생성
      const proProduct = await this.findOrCreateProduct('SummaryGenie Pro', 'pro');
      await this.findOrCreatePrice(proProduct.id, 499, 'month', 'pro');
      await this.findOrCreatePrice(proProduct.id, 4990, 'year', 'pro_yearly');
      
      // Team 플랜 체크/생성
      const teamProduct = await this.findOrCreateProduct('SummaryGenie Team', 'team');
      await this.findOrCreatePrice(teamProduct.id, 1999, 'month', 'team');
      await this.findOrCreatePrice(teamProduct.id, 19990, 'year', 'team_yearly');
      
      console.log('✅ Stripe 플랜 초기화 완료');
    } catch (error) {
      console.error('❌ Stripe 플랜 초기화 실패:', error);
    }
  }
  
  /**
   * 프로덕트 찾기 또는 생성
   */
  async findOrCreateProduct(name, metadata_key) {
    try {
      // 기존 프로덕트 검색
      const products = await this.stripe.products.list({
        limit: 100,
        active: true
      });
      
      const existing = products.data.find(p => p.metadata.key === metadata_key);
      if (existing) return existing;
      
      // 새 프로덕트 생성
      return await this.stripe.products.create({
        name,
        metadata: { key: metadata_key },
        description: `${name} 구독 플랜`
      });
    } catch (error) {
      console.error('프로덕트 생성/검색 실패:', error);
      throw error;
    }
  }
  
  /**
   * 가격 찾기 또는 생성
   */
  async findOrCreatePrice(productId, unitAmount, interval, metadata_key) {
    try {
      // 기존 가격 검색
      const prices = await this.stripe.prices.list({
        product: productId,
        limit: 100,
        active: true
      });
      
      const existing = prices.data.find(p => 
        p.metadata.key === metadata_key &&
        p.unit_amount === unitAmount &&
        p.recurring?.interval === interval
      );
      
      if (existing) {
        this.priceIds[metadata_key] = existing.id;
        return existing;
      }
      
      // 새 가격 생성
      const price = await this.stripe.prices.create({
        product: productId,
        unit_amount: unitAmount,
        currency: 'usd',
        recurring: {
          interval,
          interval_count: 1
        },
        metadata: { key: metadata_key }
      });
      
      this.priceIds[metadata_key] = price.id;
      return price;
    } catch (error) {
      console.error('가격 생성/검색 실패:', error);
      throw error;
    }
  }
  
  /**
   * 고객 생성 또는 가져오기
   */
  async getOrCreateCustomer(userId, email, metadata = {}) {
    try {
      // 기존 고객 검색
      const customers = await this.stripe.customers.list({
        email,
        limit: 1
      });
      
      if (customers.data.length > 0) {
        // 메타데이터 업데이트
        return await this.stripe.customers.update(customers.data[0].id, {
          metadata: {
            ...customers.data[0].metadata,
            ...metadata,
            userId
          }
        });
      }
      
      // 새 고객 생성
      return await this.stripe.customers.create({
        email,
        metadata: {
          ...metadata,
          userId
        }
      });
    } catch (error) {
      console.error('고객 생성/조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 체크아웃 세션 생성
   */
  async createCheckoutSession(userId, email, priceType, successUrl, cancelUrl) {
    try {
      const customer = await this.getOrCreateCustomer(userId, email);
      const priceId = this.priceIds[priceType];
      
      if (!priceId) {
        throw new Error(`Invalid price type: ${priceType}`);
      }
      
      const session = await this.stripe.checkout.sessions.create({
        customer: customer.id,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: priceType === 'team' || priceType === 'team_yearly' ? 5 : 1
        }],
        mode: 'subscription',
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          priceType
        },
        subscription_data: {
          trial_period_days: 7, // 7일 무료 체험
          metadata: {
            userId,
            planType: priceType
          }
        },
        customer_update: {
          address: 'auto'
        }
      });
      
      return session;
    } catch (error) {
      console.error('체크아웃 세션 생성 실패:', error);
      throw error;
    }
  }
  
  /**
   * 고객 포털 세션 생성 (구독 관리)
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });
      
      return session;
    } catch (error) {
      console.error('포털 세션 생성 실패:', error);
      throw error;
    }
  }
  
  /**
   * 구독 상태 조회
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        planType: subscription.metadata.planType || 'pro',
        trialEnd: subscription.trial_end,
        items: subscription.items.data
      };
    } catch (error) {
      console.error('구독 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 구독 업그레이드/다운그레이드
   */
  async updateSubscription(subscriptionId, newPriceType) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const newPriceId = this.priceIds[newPriceType];
      
      if (!newPriceId) {
        throw new Error(`Invalid price type: ${newPriceType}`);
      }
      
      // 기존 구독 아이템 ID 가져오기
      const subscriptionItemId = subscription.items.data[0].id;
      
      // 구독 업데이트 (즉시 적용)
      const updated = await this.stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscriptionItemId,
          price: newPriceId,
          quantity: newPriceType.includes('team') ? 5 : 1
        }],
        proration_behavior: 'create_prorations', // 비례 계산 적용
        metadata: {
          planType: newPriceType
        }
      });
      
      return updated;
    } catch (error) {
      console.error('구독 업데이트 실패:', error);
      throw error;
    }
  }
  
  /**
   * 구독 취소
   */
  async cancelSubscription(subscriptionId, cancelAtEnd = true) {
    try {
      if (cancelAtEnd) {
        // 기간 만료시 취소
        const subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
        return subscription;
      } else {
        // 즉시 취소
        const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
        return subscription;
      }
    } catch (error) {
      console.error('구독 취소 실패:', error);
      throw error;
    }
  }
  
  /**
   * 구독 재활성화
   */
  async reactivateSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });
      return subscription;
    } catch (error) {
      console.error('구독 재활성화 실패:', error);
      throw error;
    }
  }
  
  /**
   * 웹훅 이벤트 검증
   */
  constructWebhookEvent(payload, signature) {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
    } catch (error) {
      console.error('웹훅 검증 실패:', error);
      throw error;
    }
  }
  
  /**
   * 결제 방법 가져오기
   */
  async getPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      
      return paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year
      }));
    } catch (error) {
      console.error('결제 방법 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 기본 결제 방법 설정
   */
  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    } catch (error) {
      console.error('기본 결제 방법 설정 실패:', error);
      throw error;
    }
  }
  
  /**
   * 인보이스 목록 가져오기
   */
  async getInvoices(customerId, limit = 10) {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit
      });
      
      return invoices.data.map(invoice => ({
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency.toUpperCase(),
        status: invoice.status,
        date: new Date(invoice.created * 1000).toISOString(),
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url
      }));
    } catch (error) {
      console.error('인보이스 조회 실패:', error);
      throw error;
    }
  }
  
  /**
   * 쿠폰 생성
   */
  async createCoupon(percentOff, duration = 'once', durationInMonths = null, maxRedemptions = null) {
    try {
      const couponData = {
        percent_off: percentOff,
        duration,
        max_redemptions: maxRedemptions
      };
      
      if (duration === 'repeating' && durationInMonths) {
        couponData.duration_in_months = durationInMonths;
      }
      
      const coupon = await this.stripe.coupons.create(couponData);
      
      // 프로모션 코드 생성
      const promoCode = await this.stripe.promotionCodes.create({
        coupon: coupon.id,
        max_redemptions: maxRedemptions
      });
      
      return {
        couponId: coupon.id,
        promoCode: promoCode.code
      };
    } catch (error) {
      console.error('쿠폰 생성 실패:', error);
      throw error;
    }
  }
  
  /**
   * 사용량 기반 과금 기록 (필요시)
   */
  async recordUsage(subscriptionItemId, quantity, timestamp = Math.floor(Date.now() / 1000)) {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp,
          action: 'set' // 'increment' 또는 'set'
        }
      );
      
      return usageRecord;
    } catch (error) {
      console.error('사용량 기록 실패:', error);
      throw error;
    }
  }
  
  /**
   * 구독 통계 조회
   */
  async getSubscriptionStats() {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        status: 'active',
        limit: 100
      });
      
      const stats = {
        total: subscriptions.data.length,
        pro: 0,
        team: 0,
        mrr: 0, // Monthly Recurring Revenue
        arr: 0  // Annual Recurring Revenue
      };
      
      subscriptions.data.forEach(sub => {
        const planType = sub.metadata.planType || 'pro';
        if (planType.includes('team')) {
          stats.team++;
        } else {
          stats.pro++;
        }
        
        // MRR 계산
        const amount = sub.items.data[0].price.unit_amount / 100;
        const interval = sub.items.data[0].price.recurring.interval;
        
        if (interval === 'month') {
          stats.mrr += amount;
        } else if (interval === 'year') {
          stats.mrr += amount / 12;
        }
      });
      
      stats.arr = stats.mrr * 12;
      
      return stats;
    } catch (error) {
      console.error('구독 통계 조회 실패:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();