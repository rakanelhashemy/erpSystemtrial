export interface Item {
  id: string;
  businessId: string;
  itemNameId: number;
  itemName: string;
  code: string;
  serialNumber: string;
  groupId: string;
  groupName: string;
  locationId: string;
  locationName: string;
  departmentId: string;
  departmentTitle: string;
  price: number;
  currencyId: number;
  currencyName: string;
  brandId: number;
  modelId: number;
  materialId: number;
  countryId: number;
  status: string;
}

export interface ItemDetail extends Item {
  exchangeRate: number;
  priceInDefaultCurrency: number;
  brandName: string;
  modelName: string;
  materialName: string;
  countryName: string;
  capacity: string;
  dimensions: string;
  quantity: number;
  description: string;
  imagePath: string;
  workingDate: string;
  depreciationRate: number;
  depreciationYears: number;
  depreciationDate: string;
  scraping: boolean;
  createdByName: string;
  updatedByName: string;
}

export interface ItemFilterQuery {
  businessId: string;
  pageNumber: number;
  pageSize: number;
  search: string;
  fromPrice?: number | null;
  toPrice?: number | null;
  currencyId?: number | null;
  brandId?: number | null;
  modelId?: number | null;
  materialId?: number | null;
  countryId?: number | null;
  departmentId?: string | null;
  groupId?: string | null;
  locationId?: string | null;
  capacity?: string | null;
  fromWorkingDate?: string | null;
  toWorkingDate?: string | null;
  depreciationRate?: number | null;
  depreciationYears?: number | null;
  fromDepreciationDate?: string | null;
  toDepreciationDate?: string | null;
  scraping?: boolean | null;
}

export interface ItemRequest {
  businessId: string;
  numberOfCopies?: number | null;     // create only

  itemNameId?: number | null;
  newItemName?: string | null;        // use when the name isn't in the dropdown
  serialNumber?: string | null;

  groupId?: string | null;
  locationId?: string | null;
  departmentId?: string | null;

  price?: number | null;
  currencyId?: number | null;
  exchangeRate?: number | null;

  brandId?: number | null;
  newBrandName?: string | null;
  modelId?: number | null;
  newModelName?: string | null;
  materialId?: number | null;
  newMaterialName?: string | null;
  countryId?: number | null;

  capacity?: string | null;
  dimensions?: string | null;
  quantity?: number | null;
  description?: string | null;
  image?: File | null;

  workingDate?: string | null;        // yyyy-MM-dd
  depreciationRate?: number | null;
  depreciationYears?: number | null;
  depreciationDate?: string | null;   // yyyy-MM-dd
  scraping?: boolean | null;

  actionByUserId?: string | null;
}