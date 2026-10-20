// Currency endpoint — fetches live exchange rates and converts amounts
// Uses open.er-api.com (free, no API key required)
// Caches rates for 1 hour to avoid rate limiting
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// In-memory cache for exchange rates (1 hour TTL)
let ratesCache: { rates: Record<string, number>; fetchedAt: number; base: string } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Complete world currency metadata — 160+ currencies
// Format: [symbol, name, position, decimals]
export const CURRENCY_META: Record<string, { symbol: string; name: string; position: 'before' | 'after'; decimals: number }> = {
  // Major currencies
  USD: { symbol: '$', name: 'US Dollar', position: 'before', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', position: 'before', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', position: 'before', decimals: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', position: 'before', decimals: 0 },
  CNY: { symbol: '¥', name: 'Chinese Yuan', position: 'before', decimals: 2 },
  INR: { symbol: '₹', name: 'Indian Rupee', position: 'before', decimals: 2 },
  KRW: { symbol: '₩', name: 'Korean Won', position: 'before', decimals: 0 },
  AUD: { symbol: 'A$', name: 'Australian Dollar', position: 'before', decimals: 2 },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', position: 'before', decimals: 2 },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', position: 'before', decimals: 2 },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', position: 'before', decimals: 2 },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', position: 'before', decimals: 2 },
  // Asia
  AFN: { symbol: '؋', name: 'Afghan Afghani', position: 'before', decimals: 2 },
  AMD: { symbol: '֏', name: 'Armenian Dram', position: 'after', decimals: 2 },
  AZN: { symbol: '₼', name: 'Azerbaijani Manat', position: 'after', decimals: 2 },
  BDT: { symbol: '৳', name: 'Bangladeshi Taka', position: 'before', decimals: 2 },
  BHD: { symbol: '.د.ب', name: 'Bahraini Dinar', position: 'before', decimals: 3 },
  BND: { symbol: 'B$', name: 'Brunei Dollar', position: 'before', decimals: 2 },
  BTN: { symbol: 'Nu.', name: 'Bhutanese Ngultrum', position: 'before', decimals: 2 },
  CNH: { symbol: '¥', name: 'Chinese Yuan (Offshore)', position: 'before', decimals: 2 },
  GEL: { symbol: '₾', name: 'Georgian Lari', position: 'after', decimals: 2 },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', position: 'before', decimals: 0 },
  ILS: { symbol: '₪', name: 'Israeli Shekel', position: 'before', decimals: 2 },
  IQD: { symbol: 'ع.د', name: 'Iraqi Dinar', position: 'before', decimals: 3 },
  IRR: { symbol: '﷼', name: 'Iranian Rial', position: 'before', decimals: 0 },
  JOD: { symbol: 'د.ا', name: 'Jordanian Dinar', position: 'before', decimals: 3 },
  KHR: { symbol: '៛', name: 'Cambodian Riel', position: 'after', decimals: 2 },
  KPW: { symbol: '₩', name: 'North Korean Won', position: 'before', decimals: 0 },
  KWT: { symbol: 'د.ك', name: 'Kuwaiti Dinar', position: 'before', decimals: 3 },
  KZT: { symbol: '₸', name: 'Kazakhstani Tenge', position: 'after', decimals: 2 },
  LAK: { symbol: '₭', name: 'Lao Kip', position: 'before', decimals: 0 },
  LBP: { symbol: 'ل.ل', name: 'Lebanese Pound', position: 'before', decimals: 0 },
  LKR: { symbol: 'Rs', name: 'Sri Lankan Rupee', position: 'before', decimals: 2 },
  MNT: { symbol: '₮', name: 'Mongolian Tugrik', position: 'before', decimals: 0 },
  MMK: { symbol: 'K', name: 'Myanmar Kyat', position: 'before', decimals: 0 },
  MOP: { symbol: 'MOP$', name: 'Macanese Pataca', position: 'before', decimals: 2 },
  MVR: { symbol: 'Rf', name: 'Maldivian Rufiyaa', position: 'before', decimals: 2 },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', position: 'before', decimals: 2 },
  NPR: { symbol: 'Rs', name: 'Nepalese Rupee', position: 'before', decimals: 2 },
  OMR: { symbol: '﷼', name: 'Omani Rial', position: 'before', decimals: 3 },
  PKR: { symbol: 'Rs', name: 'Pakistani Rupee', position: 'before', decimals: 2 },
  PHP: { symbol: '₱', name: 'Philippine Peso', position: 'before', decimals: 2 },
  QAR: { symbol: '﷼', name: 'Qatari Riyal', position: 'before', decimals: 2 },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', position: 'before', decimals: 2 },
  SYP: { symbol: '£S', name: 'Syrian Pound', position: 'before', decimals: 0 },
  TJS: { symbol: 'ЅМ', name: 'Tajikistani Somoni', position: 'after', decimals: 2 },
  THB: { symbol: '฿', name: 'Thai Baht', position: 'before', decimals: 2 },
  TMT: { symbol: 'm', name: 'Turkmenistani Manat', position: 'before', decimals: 2 },
  TWD: { symbol: 'NT$', name: 'Taiwan Dollar', position: 'before', decimals: 0 },
  UZS: { symbol: 'soʻm', name: 'Uzbekistani Som', position: 'after', decimals: 0 },
  VND: { symbol: '₫', name: 'Vietnamese Dong', position: 'after', decimals: 0 },
  YER: { symbol: '﷼', name: 'Yemeni Rial', position: 'before', decimals: 0 },
  // Europe
  ALL: { symbol: 'L', name: 'Albanian Lek', position: 'before', decimals: 0 },
  AMD_EU: { symbol: '֏', name: 'Armenian Dram', position: 'after', decimals: 2 },
  BAM: { symbol: 'KM', name: 'Bosnia Mark', position: 'after', decimals: 2 },
  BGN: { symbol: 'лв', name: 'Bulgarian Lev', position: 'after', decimals: 2 },
  BYN: { symbol: 'Br', name: 'Belarusian Ruble', position: 'after', decimals: 2 },
  CHF_LI: { symbol: 'Fr', name: 'Swiss Franc (Liechtenstein)', position: 'before', decimals: 2 },
  CZK: { symbol: 'Kč', name: 'Czech Koruna', position: 'after', decimals: 0 },
  DKK: { symbol: 'kr', name: 'Danish Krone', position: 'before', decimals: 2 },
  DKK_GL: { symbol: 'kr', name: 'Danish Krone (Greenland)', position: 'before', decimals: 2 },
  EUR_AD: { symbol: '€', name: 'Euro (Andorra)', position: 'before', decimals: 2 },
  EUR_AT: { symbol: '€', name: 'Euro (Austria)', position: 'before', decimals: 2 },
  EUR_BE: { symbol: '€', name: 'Euro (Belgium)', position: 'before', decimals: 2 },
  EUR_CY: { symbol: '€', name: 'Euro (Cyprus)', position: 'before', decimals: 2 },
  EUR_EE: { symbol: '€', name: 'Euro (Estonia)', position: 'after', decimals: 2 },
  EUR_FI: { symbol: '€', name: 'Euro (Finland)', position: 'before', decimals: 2 },
  EUR_FR: { symbol: '€', name: 'Euro (France)', position: 'after', decimals: 2 },
  EUR_DE: { symbol: '€', name: 'Euro (Germany)', position: 'after', decimals: 2 },
  EUR_GR: { symbol: '€', name: 'Euro (Greece)', position: 'before', decimals: 2 },
  EUR_IE: { symbol: '€', name: 'Euro (Ireland)', position: 'before', decimals: 2 },
  EUR_IT: { symbol: '€', name: 'Euro (Italy)', position: 'after', decimals: 2 },
  EUR_XK: { symbol: '€', name: 'Euro (Kosovo)', position: 'before', decimals: 2 },
  EUR_LV: { symbol: '€', name: 'Euro (Latvia)', position: 'after', decimals: 2 },
  EUR_LT: { symbol: '€', name: 'Euro (Lithuania)', position: 'after', decimals: 2 },
  EUR_LU: { symbol: '€', name: 'Euro (Luxembourg)', position: 'before', decimals: 2 },
  EUR_MT: { symbol: '€', name: 'Euro (Malta)', position: 'before', decimals: 2 },
  EUR_MC: { symbol: '€', name: 'Euro (Monaco)', position: 'before', decimals: 2 },
  EUR_ME: { symbol: '€', name: 'Euro (Montenegro)', position: 'before', decimals: 2 },
  EUR_NL: { symbol: '€', name: 'Euro (Netherlands)', position: 'before', decimals: 2 },
  EUR_PT: { symbol: '€', name: 'Euro (Portugal)', position: 'before', decimals: 2 },
  EUR_SM: { symbol: '€', name: 'Euro (San Marino)', position: 'before', decimals: 2 },
  EUR_SK: { symbol: '€', name: 'Euro (Slovakia)', position: 'before', decimals: 2 },
  EUR_SI: { symbol: '€', name: 'Euro (Slovenia)', position: 'before', decimals: 2 },
  EUR_ES: { symbol: '€', name: 'Euro (Spain)', position: 'after', decimals: 2 },
  EUR_VA: { symbol: '€', name: 'Euro (Vatican City)', position: 'before', decimals: 2 },
  GBP_GI: { symbol: '£', name: 'Pound (Gibraltar)', position: 'before', decimals: 2 },
  GBP_IM: { symbol: '£', name: 'Pound (Isle of Man)', position: 'before', decimals: 2 },
  GBP_JE: { symbol: '£', name: 'Pound (Jersey)', position: 'before', decimals: 2 },
  GBP_GG: { symbol: '£', name: 'Pound (Guernsey)', position: 'before', decimals: 2 },
  GEL_EU: { symbol: '₾', name: 'Georgian Lari', position: 'after', decimals: 2 },
  HUF: { symbol: 'Ft', name: 'Hungarian Forint', position: 'after', decimals: 0 },
  ISK: { symbol: 'kr', name: 'Icelandic Krona', position: 'before', decimals: 0 },
  MDL: { symbol: 'L', name: 'Moldovan Leu', position: 'after', decimals: 2 },
  MKD: { symbol: 'ден', name: 'Macedonian Denar', position: 'before', decimals: 0 },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', position: 'before', decimals: 2 },
  NOK_SJ: { symbol: 'kr', name: 'Norwegian Krone (Svalbard)', position: 'before', decimals: 2 },
  PLN: { symbol: 'zł', name: 'Polish Zloty', position: 'after', decimals: 2 },
  RON: { symbol: 'lei', name: 'Romanian Leu', position: 'after', decimals: 2 },
  RSD: { symbol: 'дин', name: 'Serbian Dinar', position: 'after', decimals: 0 },
  RUB: { symbol: '₽', name: 'Russian Ruble', position: 'after', decimals: 2 },
  SEK: { symbol: 'kr', name: 'Swedish Krona', position: 'after', decimals: 2 },
  UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', position: 'before', decimals: 2 },
  // Americas
  ARS: { symbol: '$', name: 'Argentine Peso', position: 'before', decimals: 2 },
  AWG: { symbol: 'ƒ', name: 'Aruban Florin', position: 'before', decimals: 2 },
  BBD: { symbol: 'Bds$', name: 'Barbadian Dollar', position: 'before', decimals: 2 },
  BZD: { symbol: 'BZ$', name: 'Belize Dollar', position: 'before', decimals: 2 },
  BMD: { symbol: 'BD$', name: 'Bermudian Dollar', position: 'before', decimals: 2 },
  BOB: { symbol: 'Bs', name: 'Bolivian Boliviano', position: 'before', decimals: 2 },
  BRL: { symbol: 'R$', name: 'Brazilian Real', position: 'before', decimals: 2 },
  BSD: { symbol: 'B$', name: 'Bahamian Dollar', position: 'before', decimals: 2 },
  BZ_DOLLAR: { symbol: 'BZ$', name: 'Belize Dollar', position: 'before', decimals: 2 },
  CLP: { symbol: '$', name: 'Chilean Peso', position: 'before', decimals: 0 },
  COP: { symbol: '$', name: 'Colombian Peso', position: 'before', decimals: 0 },
  CRC: { symbol: '₡', name: 'Costa Rican Colon', position: 'before', decimals: 0 },
  CUP: { symbol: '₱', name: 'Cuban Peso', position: 'before', decimals: 2 },
  CVE: { symbol: '$', name: 'Cape Verdean Escudo', position: 'before', decimals: 2 },
  DOP: { symbol: 'RD$', name: 'Dominican Peso', position: 'before', decimals: 2 },
  EGP: { symbol: 'E£', name: 'Egyptian Pound', position: 'before', decimals: 2 },
  FJD: { symbol: 'FJ$', name: 'Fijian Dollar', position: 'before', decimals: 2 },
  GTQ: { symbol: 'Q', name: 'Guatemalan Quetzal', position: 'before', decimals: 2 },
  GYD: { symbol: 'G$', name: 'Guyanese Dollar', position: 'before', decimals: 2 },
  HNL: { symbol: 'L', name: 'Honduran Lempira', position: 'before', decimals: 2 },
  JMD: { symbol: 'J$', name: 'Jamaican Dollar', position: 'before', decimals: 2 },
  KYD: { symbol: 'KY$', name: 'Cayman Islands Dollar', position: 'before', decimals: 2 },
  LRD: { symbol: 'L$', name: 'Liberian Dollar', position: 'before', decimals: 2 },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', position: 'before', decimals: 2 },
  NIO: { symbol: 'C$', name: 'Nicaraguan Cordoba', position: 'before', decimals: 2 },
  PAB: { symbol: 'B/.', name: 'Panamanian Balboa', position: 'before', decimals: 2 },
  PEG: { symbol: 'Gs', name: 'Paraguayan Guarani', position: 'before', decimals: 0 },
  PEN: { symbol: 'S/', name: 'Peruvian Sol', position: 'before', decimals: 2 },
  PYG: { symbol: '₲', name: 'Paraguayan Guarani', position: 'before', decimals: 0 },
  SRD: { symbol: 'Sr$', name: 'Surinamese Dollar', position: 'before', decimals: 2 },
  TTD: { symbol: 'TT$', name: 'Trinidad Dollar', position: 'before', decimals: 2 },
  UYU: { symbol: '$U', name: 'Uruguayan Peso', position: 'before', decimals: 2 },
  VES: { symbol: 'Bs', name: 'Venezuelan Bolivar', position: 'before', decimals: 2 },
  XCD: { symbol: 'EC$', name: 'East Caribbean Dollar', position: 'before', decimals: 2 },
  // Africa
  AOA: { symbol: 'Kz', name: 'Angolan Kwanza', position: 'before', decimals: 0 },
  BIF: { symbol: 'FBu', name: 'Burundian Franc', position: 'before', decimals: 0 },
  BWP: { symbol: 'P', name: 'Botswanan Pula', position: 'before', decimals: 2 },
  CDF: { symbol: 'FC', name: 'Congolese Franc', position: 'after', decimals: 2 },
  CHF_EU: { symbol: 'Fr', name: 'Swiss Franc', position: 'before', decimals: 2 },
  CVE_AFR: { symbol: '$', name: 'Cape Verdean Escudo', position: 'before', decimals: 2 },
  DJF: { symbol: 'Fdj', name: 'Djiboutian Franc', position: 'before', decimals: 0 },
  DZD: { symbol: 'دج', name: 'Algerian Dinar', position: 'before', decimals: 2 },
  EGP_AFR: { symbol: 'E£', name: 'Egyptian Pound', position: 'before', decimals: 2 },
  ERN: { symbol: 'Nfk', name: 'Eritrean Nakfa', position: 'before', decimals: 2 },
  ETB: { symbol: 'Br', name: 'Ethiopian Birr', position: 'before', decimals: 2 },
  GHS: { symbol: '₵', name: 'Ghanaian Cedi', position: 'before', decimals: 2 },
  GMD: { symbol: 'D', name: 'Gambian Dalasi', position: 'before', decimals: 2 },
  GNF: { symbol: 'FG', name: 'Guinean Franc', position: 'before', decimals: 0 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', position: 'before', decimals: 2 },
  KMF: { symbol: 'CF', name: 'Comorian Franc', position: 'before', decimals: 0 },
  LSL: { symbol: 'L', name: 'Lesotho Loti', position: 'before', decimals: 2 },
  LYD: { symbol: 'ل.د', name: 'Libyan Dinar', position: 'before', decimals: 3 },
  MAD: { symbol: 'د.م.', name: 'Moroccan Dirham', position: 'before', decimals: 2 },
  MGA: { symbol: 'Ar', name: 'Malagasy Ariary', position: 'before', decimals: 0 },
  MGA2: { symbol: 'Ar', name: 'Malagasy Ariary', position: 'before', decimals: 0 },
  MTL: { symbol: 'Lm', name: 'Maltese Lira', position: 'before', decimals: 2 },
  MUR: { symbol: '₨', name: 'Mauritian Rupee', position: 'before', decimals: 0 },
  MWK: { symbol: 'MK', name: 'Malawian Kwacha', position: 'before', decimals: 2 },
  MZN: { symbol: 'MT', name: 'Mozambican Metical', position: 'before', decimals: 2 },
  NAD: { symbol: 'N$', name: 'Namibian Dollar', position: 'before', decimals: 2 },
  NGN: { symbol: '₦', name: 'Nigerian Naira', position: 'before', decimals: 2 },
  RWF: { symbol: 'FRw', name: 'Rwandan Franc', position: 'before', decimals: 0 },
  SDG: { symbol: '£S', name: 'Sudanese Pound', position: 'before', decimals: 2 },
  SHP: { symbol: '£', name: 'Saint Helena Pound', position: 'before', decimals: 2 },
  SLL: { symbol: 'Le', name: 'Sierra Leonean Leone', position: 'before', decimals: 0 },
  SOS: { symbol: 'Sh', name: 'Somali Shilling', position: 'before', decimals: 0 },
  STD: { symbol: 'Db', name: 'Sao Tome Dobra', position: 'before', decimals: 0 },
  SZL: { symbol: 'L', name: 'Swazi Lilangeni', position: 'before', decimals: 2 },
  TND: { symbol: 'د.ت', name: 'Tunisian Dinar', position: 'before', decimals: 3 },
  TZA: { symbol: 'TSh', name: 'Tanzanian Shilling', position: 'before', decimals: 0 },
  UGX: { symbol: 'USh', name: 'Ugandan Shilling', position: 'before', decimals: 0 },
  XAF: { symbol: 'FCFA', name: 'Central African CFA Franc', position: 'before', decimals: 0 },
  XOF: { symbol: 'CFA', name: 'West African CFA Franc', position: 'before', decimals: 0 },
  ZAR: { symbol: 'R', name: 'South African Rand', position: 'before', decimals: 2 },
  ZMW: { symbol: 'ZK', name: 'Zambian Kwacha', position: 'before', decimals: 2 },
  ZWL: { symbol: 'Z$', name: 'Zimbabwean Dollar', position: 'before', decimals: 2 },
  // Oceania
  AUD_NR: { symbol: 'A$', name: 'Australian Dollar (Nauru)', position: 'before', decimals: 2 },
  AUD_KI: { symbol: 'A$', name: 'Australian Dollar (Kiribati)', position: 'before', decimals: 2 },
  AUD_TV: { symbol: 'A$', name: 'Australian Dollar (Tuvalu)', position: 'before', decimals: 2 },
  AUD_NR2: { symbol: 'A$', name: 'Australian Dollar (Nauru)', position: 'before', decimals: 2 },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', position: 'before', decimals: 2 },
  NZD_CK: { symbol: 'NZ$', name: 'NZ Dollar (Cook Islands)', position: 'before', decimals: 2 },
  NZD_NU: { symbol: 'NZ$', name: 'NZ Dollar (Niue)', position: 'before', decimals: 2 },
  NZD_PG: { symbol: 'NZ$', name: 'NZ Dollar (Pitcairn)', position: 'before', decimals: 2 },
  NZD_TK: { symbol: 'NZ$', name: 'NZ Dollar (Tokelau)', position: 'before', decimals: 2 },
  PGK: { symbol: 'K', name: 'Papua New Guinean Kina', position: 'before', decimals: 2 },
  SBD: { symbol: 'SI$', name: 'Solomon Islands Dollar', position: 'before', decimals: 2 },
  TOP: { symbol: 'T$', name: 'Tongan Paʻanga', position: 'before', decimals: 2 },
  VUV: { symbol: 'VT', name: 'Vanuatu Vatu', position: 'before', decimals: 0 },
  WST: { symbol: 'WS$', name: 'Samoan Tala', position: 'before', decimals: 2 },
  // Middle East
  AED: { symbol: 'د.إ', name: 'UAE Dirham', position: 'before', decimals: 2 },
  TRY: { symbol: '₺', name: 'Turkish Lira', position: 'before', decimals: 2 },
  // Other / Special
  BND2: { symbol: 'B$', name: 'Brunei Dollar', position: 'before', decimals: 2 },
  BTC: { symbol: '₿', name: 'Bitcoin', position: 'before', decimals: 8 },
  ETH: { symbol: 'Ξ', name: 'Ethereum', position: 'before', decimals: 6 },
  XDR: { symbol: 'SDR', name: 'Special Drawing Rights', position: 'before', decimals: 0 },
  XAU: { symbol: 'XAU', name: 'Gold (troy ounce)', position: 'before', decimals: 2 },
  XAG: { symbol: 'XAG', name: 'Silver (troy ounce)', position: 'before', decimals: 2 },
  XPT: { symbol: 'XPT', name: 'Platinum (troy ounce)', position: 'before', decimals: 2 },
  XPD: { symbol: 'XPD', name: 'Palladium (troy ounce)', position: 'before', decimals: 2 },
  ANG: { symbol: 'ƒ', name: 'Netherlands Antillean Guilder', position: 'before', decimals: 2 },
  ANG2: { symbol: 'ƒ', name: 'Netherlands Antillean Guilder', position: 'before', decimals: 2 },
  CUC: { symbol: 'CUC$', name: 'Cuban Convertible Peso', position: 'before', decimals: 2 },
  GTQ2: { symbol: 'Q', name: 'Guatemalan Quetzal', position: 'before', decimals: 2 },
  HRK: { symbol: 'kn', name: 'Croatian Kuna', position: 'after', decimals: 2 },
  LTL: { symbol: 'Lt', name: 'Lithuanian Litas', position: 'after', decimals: 2 },
  LVL: { symbol: 'Ls', name: 'Latvian Lats', position: 'before', decimals: 2 },
  MTL2: { symbol: 'Lm', name: 'Maltese Lira', position: 'before', decimals: 2 },
  ROL: { symbol: 'L', name: 'Romanian Leu (Old)', position: 'after', decimals: 0 },
  SIT: { symbol: 'tolars', name: 'Slovenian Tolar', position: 'after', decimals: 0 },
  SKK: { symbol: 'Sk', name: 'Slovak Koruna', position: 'before', decimals: 0 },
  TMM: { symbol: 'm', name: 'Turkmenistani Manat (Old)', position: 'before', decimals: 0 },
  UYW: { symbol: '$U', name: 'Uruguayan Peso (Indexed)', position: 'before', decimals: 2 },
  VEB: { symbol: 'Bs', name: 'Venezuelan Bolivar (Old)', position: 'before', decimals: 2 },
  VEF: { symbol: 'Bs', name: 'Venezuelan Bolivar (Old)', position: 'before', decimals: 2 },
  XPF: { symbol: '₣', name: 'CFP Franc', position: 'before', decimals: 0 },
  YUM: { symbol: 'дин', name: 'Yugoslav Dinar', position: 'after', decimals: 0 },
  ZAL: { symbol: 'R', name: 'South African Rand (Financial)', position: 'before', decimals: 2 },
  ZMK: { symbol: 'ZK', name: 'Zambian Kwacha (Old)', position: 'before', decimals: 0 },
  ZRN: { symbol: 'Z', name: 'Zairean New Zaire', position: 'before', decimals: 0 },
  ZRZ: { symbol: 'Z', name: 'Zairean Zaire', position: 'before', decimals: 0 },
  ZWC: { symbol: '$', name: 'Zimbabwean Dollar (Old)', position: 'before', decimals: 2 },
  ZWD: { symbol: 'Z$', name: 'Zimbabwean Dollar (Old)', position: 'before', decimals: 2 },
  ZWN: { symbol: 'Z$', name: 'Zimbabwean Dollar (Old)', position: 'before', decimals: 2 },
  ZWP: { symbol: 'Z$', name: 'Zimbabwean Dollar (Old)', position: 'before', decimals: 2 },
  ZWR: { symbol: 'Z$', name: 'Zimbabwean Dollar (Old)', position: 'before', decimals: 2 },
  // Add missing common currencies
  BRN: { symbol: 'B$', name: 'Brunei Dollar', position: 'before', decimals: 2 },
  KID: { symbol: 'A$', name: 'Kiribati Dollar', position: 'before', decimals: 2 },
  NRU: { symbol: 'A$', name: 'Nauruan Dollar', position: 'before', decimals: 2 },
  TUV: { symbol: 'A$', name: 'Tuvaluan Dollar', position: 'before', decimals: 2 },
}

async function fetchLiveRates(): Promise<Record<string, number>> {
  // Check cache first
  if (ratesCache && Date.now() - ratesCache.fetchedAt < CACHE_TTL) {
    return ratesCache.rates
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'Accept': 'application/json' },
      // @ts-ignore — Next.js fetch cache options
      next: { revalidate: 3600 },
    })
    const data = await res.json()
    if (data.rates) {
      ratesCache = {
        rates: data.rates,
        fetchedAt: Date.now(),
        base: 'USD',
      }
      return data.rates
    }
  } catch (err) {
    console.error('Failed to fetch live rates:', err)
    // Fallback to static rates if API fails
    if (ratesCache) return ratesCache.rates
  }

  // Fallback static rates (approximate, as of 2024)
  return {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CNY: 7.24, INR: 83.3,
    KRW: 1340, AUD: 1.52, CAD: 1.36, CHF: 0.88, SGD: 1.34, HKD: 7.82,
    BRL: 5.04, MXN: 17.1, RUB: 92.5, ZAR: 18.7, AED: 3.67, THB: 35.8,
    SEK: 10.6, NZD: 1.64,
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get user's selected currency
    const auth = await requireUser(req)
  if (auth.error) return auth.error
  const user = auth.user

    let targetCurrency = 'USD'
    if (user?.settings?.currency) {
      targetCurrency = user.settings.currency
    }

    const rates = await fetchLiveRates()
    const rate = rates[targetCurrency] || 1
    const meta = CURRENCY_META[targetCurrency] || {
      symbol: targetCurrency,
      name: targetCurrency,
      position: 'before' as const,
      decimals: 2,
    }

    // Build supported currencies list — use live rates from the API
    // The open.er-api.com returns 160+ currencies; we merge with our metadata
    const supportedCurrencies = Object.keys(rates)
      .filter(code => code !== 'USD') // USD is base, rate = 1
      .sort()
      .map(code => {
        const m = CURRENCY_META[code] || {
          symbol: code,
          name: code,
          position: 'before' as const,
          decimals: 2,
        }
        return {
          code,
          symbol: m.symbol,
          name: m.name,
          rate: rates[code] || null,
          decimals: m.decimals,
        }
      })

    // Add USD at the top
    supportedCurrencies.unshift({
      code: 'USD',
      symbol: '$',
      name: 'US Dollar',
      rate: 1,
      decimals: 2,
    })

    return NextResponse.json({
      ok: true,
      base: 'USD',
      target: targetCurrency,
      rate,
      rates,
      meta,
      fetchedAt: ratesCache?.fetchedAt || Date.now(),
      cached: ratesCache !== null && Date.now() - ratesCache.fetchedAt < CACHE_TTL,
      supportedCurrencies,
      totalCurrencies: supportedCurrencies.length,
    })
  } catch (err: any) {
    console.error('Currency API error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
