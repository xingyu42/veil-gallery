export interface ImageMeta {
  id: number;
  width: number | null;
  height: number | null;
  orientation: "portrait" | "landscape" | "square" | string | null;
  sort_order?: number;
  gallery?: {
    id: number;
    title: string;
    category?: string;
  };
  tags?: string[];
}

export interface TagItem {
  id: number;
  name: string;
  normalized_name: string;
  gallery_count: number;
}

export interface CategoryItem {
  name: string;
  gallery_count: number;
}

export interface GalleryCover {
  image_id: number;
  width: number | null;
  height: number | null;
  orientation: string | null;
  file_name?: string;
}

export interface GalleryListItem {
  id: number;
  title: string;
  series_number: string | null;
  category: string | null;
  image_count: number;
  uploaded_images?: number;
  status: string;
  updated_at: string;
  cover: GalleryCover | null;
}

export interface GalleryImage {
  id: number;
  sort_order: number;
  width: number | null;
  height: number | null;
  orientation: string | null;
  file_size_bytes?: number | null;
  status: string;
  uploaded?: boolean;
}

export interface GalleryDetail extends GalleryListItem {
  model_name?: string | null;
  model_name_cn?: string | null;
  release_time?: string | null;
  cover_image_id?: number;
  tags: string[];
  attachments?: unknown[];
  images: GalleryImage[];
}

export interface GalleryImagePage {
  items: GalleryImage[];
  total: number;
  offset: number;
  limit: number;
  next_offset: number;
  has_more: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  page?: number;
  total_pages?: number;
  has_prev?: boolean;
  has_next?: boolean;
  next_offset?: number;
}

export interface SiteConfig {
  hero_title: string;
  hero_desc: string;
  announcement?: string;
  featured_categories: string[];
  faq_items?: unknown[];
  donation_items?: unknown[];
  scale: {
    galleries: number;
    images: number;
    tags: number;
    categories: number;
  };
}

export interface FeaturedTag {
  id: number;
  name: string;
  normalized_name: string;
}
