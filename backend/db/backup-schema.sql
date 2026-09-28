-- ============================================================================
-- BACKUP DATABASE SCHEMA  (backup-schema.sql)
-- Only the tables that are backed up. Run this on the BACKUP project only.
-- ============================================================================

-- ── Sync bookkeeping (shared token: also create this on MAIN) ──────────────
CREATE TABLE public.backup_sync_state (
    entity text NOT NULL,
    last_synced_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.backup_sync_state
    ADD CONSTRAINT backup_sync_state_pkey PRIMARY KEY (entity);


-- ── Booking ─────────────────────────────────────────────────────────────────
CREATE TABLE public."Booking" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text,
    status text,
    service_type text,
    custom_service text,
    desired_date timestamp with time zone,
    duration_minutes integer,
    children_count integer,
    contact_name text,
    contact_email text,
    contact_phone text,
    notes text,
    image_url text,
    cloudinary_public_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    total_price numeric,
    payment_status text,
    event_name text,
    user_id uuid,
    description text,
    calcom_uri text,
    token text,
    booking_reference text,
    location text,
    cancellation_reason text,
    booking_id bigint,
    rescheduled_from_id bigint,
    reschedule_reason text,
    payment_amount numeric,
    payment_currency text
);
ALTER TABLE ONLY public."Booking" ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);


-- ── Message (contact) ───────────────────────────────────────────────────────
CREATE TABLE public."Message" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text,
    phone text,
    message text,
    status text,
    "adminNotes" text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "repliedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone,
    subject_id uuid,
    custom_subject text,
    deleted_at timestamp with time zone
);
ALTER TABLE ONLY public."Message" ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


-- ── NewsletterSubscriber ────────────────────────────────────────────────────
CREATE TABLE public."NewsletterSubscriber" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    phone text,
    subscribed_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);
ALTER TABLE ONLY public."NewsletterSubscriber"
    ADD CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY (id);


-- ── GalleryCategory ─────────────────────────────────────────────────────────
CREATE TABLE public."GalleryCategory" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name_fr text,
    name_ar text,
    slug text,
    description_fr text,
    description_ar text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_public_id text,
    has_discount boolean DEFAULT false,
    image_url text
);
ALTER TABLE ONLY public."GalleryCategory"
    ADD CONSTRAINT "GalleryCategory_pkey" PRIMARY KEY (id);


-- ── GalleryItem ─────────────────────────────────────────────────────────────
CREATE TABLE public."GalleryItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    title_fr text,
    title_ar text,
    description_fr text,
    description_ar text,
    media_url text,
    is_gif boolean DEFAULT false,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    media_type text DEFAULT 'image',
    deleted_at timestamp with time zone,
    image_public_id text
);
ALTER TABLE ONLY public."GalleryItem" ADD CONSTRAINT "GalleryItem_pkey" PRIMARY KEY (id);


-- ── Order ───────────────────────────────────────────────────────────────────
CREATE TABLE public."Order" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_reference text,
    total_amount numeric,
    customer_name text,
    contact_email text,
    contact_phone text,
    shipping_address text,
    notes text,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);
ALTER TABLE ONLY public."Order" ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


-- ── OrderItem ───────────────────────────────────────────────────────────────
CREATE TABLE public."OrderItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    product_id uuid,
    product_name text,
    quantity integer,
    unit_price numeric,
    total_price numeric,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public."OrderItem" ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


-- ── visitor_locations ───────────────────────────────────────────────────────
CREATE TABLE public.visitor_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country text,
    city text,
    lat double precision,
    lon double precision,
    visit_count integer DEFAULT 1,
    last_visited_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.visitor_locations
    ADD CONSTRAINT visitor_locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.visitor_locations
    ADD CONSTRAINT visitor_locations_country_city_key UNIQUE (country, city);