--
-- PostgreSQL database dump
--

\restrict ZvoX4hFWKIysUYtzZgQx3qx5tt1tHGcDckLc24XJCrJFqvb2lBGoVMqKMXmElbq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: adjust_stock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(p_product_id uuid, p_quantity integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE "Product"
  SET stock_quantity = stock_quantity + p_quantity
  WHERE id = p_product_id AND stock_quantity + p_quantity >= 0;
  RETURN FOUND;
END;
$$;


--
-- Name: atomic_delete_worker_with_salary_event(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atomic_delete_worker_with_salary_event(p_id uuid, p_event_description text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_salary NUMERIC;
  v_change NUMERIC;
  v_deleted JSONB;
BEGIN
  DELETE FROM "Worker"
    WHERE id = p_id
    RETURNING salary, row_to_json("Worker") INTO v_salary, v_deleted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Remove the ongoing salary cost from the wallet, same transaction
  v_change := 0 - (-v_salary);   -- = +v_salary : cancels the recurring expense
  INSERT INTO "FinancialEvent"
    (source, "sourceId", field, "oldValue", "newValue", change, description, "createdAt")
  VALUES
    ('worker', p_id, 'salary', -v_salary, 0, v_change, p_event_description, now());

  UPDATE "WalletSummary"
    SET balance      = balance + v_change,
        "totalIncome" = "totalIncome" + CASE WHEN v_change > 0 THEN v_change ELSE 0 END,
        "updatedAt"   = now()
    WHERE id = 1;

  RETURN v_deleted;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'atomic_delete_worker_with_salary_event failed: %', SQLERRM;
END;
$$;


--
-- Name: atomic_log_financial_event(text, uuid, text, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atomic_log_financial_event(p_source text, p_source_id uuid, p_field text, p_old_value numeric, p_new_value numeric, p_description text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_change NUMERIC;
  v_event JSONB;
BEGIN
  v_change := p_new_value - p_old_value;

  INSERT INTO "FinancialEvent"
    (source, "sourceId", field, "oldValue", "newValue", change, description, "createdAt")
  VALUES
    (p_source, p_source_id, p_field, p_old_value, p_new_value, v_change, p_description, now())
  RETURNING jsonb_build_object(
    'id', id, 'source', source, 'sourceId', "sourceId", 'field', field,
    'oldValue', "oldValue", 'newValue', "newValue", 'change', change,
    'description', description, 'createdAt', "createdAt"
  ) INTO v_event;

  UPDATE "WalletSummary"
  SET balance = balance + v_change,
      "totalIncome" = "totalIncome" + CASE WHEN v_change > 0 THEN v_change ELSE 0 END,
      "updatedAt" = now()
  WHERE id = 1;

  RETURN v_event;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'atomic_log_financial_event failed: %', SQLERRM;
END;
$$;


--
-- Name: atomic_update_worker(text, numeric, text, text, text, text, text, text, text, boolean, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atomic_update_worker(p_id text, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_salary numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_rows_affected INT;
BEGIN
  UPDATE "Worker"
  SET "firstName" = p_first_name,
      "lastName" = p_last_name,
      email = p_email,
      address = p_address,
      role = p_role,
      phone = p_phone,
      notes = p_notes,
      "isActive" = p_is_active,
      salary = p_salary
  WHERE id = p_id
    AND salary = p_expected_salary  -- optimistic lock
  RETURNING row_to_json("Worker") INTO v_result;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    -- Conflict: another writer changed the salary
    RAISE EXCEPTION 'WORKER_CONFLICT' USING ERRCODE = '40001';
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;


--
-- Name: atomic_update_worker_with_salary_event(uuid, integer, numeric, text, text, text, text, text, text, text, boolean, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atomic_update_worker_with_salary_event(p_id uuid, p_expected_version integer, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_new_salary numeric, p_event_description text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_result JSONB;
  v_change NUMERIC;
BEGIN
  UPDATE "Worker"
    SET "firstName" = p_first_name,
        "lastName"  = p_last_name,
        email       = p_email,
        address     = p_address,
        role        = p_role,
        phone       = p_phone,
        notes       = p_notes,
        "isActive"  = p_is_active,
        salary      = p_new_salary,
        version     = version + 1                 -- bump on every change
    WHERE id = p_id
      AND version = p_expected_version            -- full-row optimistic lock
    RETURNING row_to_json("Worker") INTO v_result;

  IF NOT FOUND THEN
    -- version changed (or row gone) → someone else edited it
    RAISE EXCEPTION 'WORKER_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF p_expected_salary IS DISTINCT FROM p_new_salary THEN
    v_change := (-p_new_salary) - (-p_expected_salary);
    INSERT INTO "FinancialEvent"
      (source, "sourceId", field, "oldValue", "newValue", change, description, "createdAt")
    VALUES
      ('worker', p_id, 'salary', -p_expected_salary, -p_new_salary, v_change, p_event_description, now());

    UPDATE "WalletSummary"
      SET balance      = balance + v_change,
          "totalIncome" = "totalIncome" + CASE WHEN v_change > 0 THEN v_change ELSE 0 END,
          "updatedAt"   = now()
      WHERE id = 1;
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'atomic_update_worker_with_salary_event failed: %', SQLERRM;
END;
$$;


--
-- Name: decrement_event_slots(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_event_slots(event_id uuid, slots integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  updated BOOLEAN;
BEGIN
  UPDATE "Event" SET "availableSlots" = "availableSlots" - slots
  WHERE id = event_id AND "availableSlots" >= slots
  RETURNING true INTO updated;
  RETURN COALESCE(updated, false);
END;
$$;


--
-- Name: financial_event_exists_in_month(text, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financial_event_exists_in_month(p_source text, p_source_id uuid, p_month_start timestamp with time zone, p_month_end timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "FinancialEvent"
    WHERE source = p_source
      AND "sourceId" = p_source_id
      AND "createdAt" >= p_month_start
      AND "createdAt" < p_month_end
  );
END;
$$;


--
-- Name: get_category_product_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_category_product_counts() RETURNS TABLE(category_id uuid, count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT cat.id, COUNT(p.id)::bigint
  FROM "ProductCategory" cat
  LEFT JOIN "Product" p ON p.category_id = cat.id AND p.deleted_at IS NULL
  GROUP BY cat.id;
$$;


--
-- Name: get_database_size(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_database_size() RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pg_database_size(current_database());
$$;


--
-- Name: get_gallery_category_item_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gallery_category_item_counts() RETURNS TABLE(category_id uuid, count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT cat.id, COUNT(i.id)::bigint
  FROM "GalleryCategory" cat
  LEFT JOIN "GalleryItem" i ON i.category_id = cat.id
    AND i.deleted_at IS NULL
  GROUP BY cat.id;
$$;


--
-- Name: get_top_selling_products(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_selling_products(start_date timestamp with time zone, limit_rows integer) RETURNS TABLE(product_id uuid, total_sold bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT oi.product_id, SUM(oi.quantity) AS total_sold
  FROM "OrderItem" oi
  JOIN "Order" o ON o.id = oi.order_id
  WHERE o.status = 'shipped'
    AND o.created_at >= start_date
  GROUP BY oi.product_id
  ORDER BY total_sold DESC
  LIMIT limit_rows;
$$;


--
-- Name: get_wallet_bounds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_wallet_bounds() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_min TIMESTAMPTZ;
  v_max TIMESTAMPTZ;
BEGIN
  SELECT MIN("createdAt"), MAX("createdAt")
  INTO v_min, v_max
  FROM "FinancialEvent";

  IF v_min IS NULL THEN
    RETURN jsonb_build_object('minDate', NULL, 'maxDate', NULL, 'hasData', false);
  END IF;

  RETURN jsonb_build_object(
    'minDate', v_min,
    'maxDate', v_max,
    'hasData', true
  );
END;
$$;


--
-- Name: get_wallet_data(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_wallet_data(p_start timestamp with time zone, p_end timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_summary JSONB;
  v_events JSONB;
  v_monthly_expense NUMERIC := 0;
  v_total_expense NUMERIC := 0;
  v_balance_before NUMERIC := 0;
  v_now TIMESTAMPTZ := now();
  v_month_start TIMESTAMPTZ := date_trunc('month', v_now);
  v_month_end TIMESTAMPTZ := date_trunc('month', v_now) + interval '1 month';
  v_actual_start TIMESTAMPTZ;
  v_actual_end TIMESTAMPTZ;
BEGIN
  SELECT jsonb_build_object('balance', balance, 'totalIncome', "totalIncome")
  INTO v_summary FROM "WalletSummary" WHERE id = 1;

  SELECT COALESCE(SUM(ABS(change)), 0) INTO v_monthly_expense
  FROM "FinancialEvent"
  WHERE change < 0 AND "createdAt" >= v_month_start AND "createdAt" < v_month_end;

  SELECT COALESCE(SUM(ABS(change)), 0) INTO v_total_expense
  FROM "FinancialEvent" WHERE change < 0;

  IF p_start IS NOT NULL AND p_end IS NOT NULL THEN
    v_actual_start := p_start; v_actual_end := p_end;
  ELSE
    v_actual_start := '1970-01-01'::timestamptz; v_actual_end := v_now + interval '100 years';
  END IF;

  SELECT COALESCE(SUM(change), 0) INTO v_balance_before
  FROM "FinancialEvent" WHERE "createdAt" < v_actual_start;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t."createdAt"), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT id, source, "sourceId", field, "oldValue", "newValue", change, description, "createdAt"
    FROM "FinancialEvent"
    WHERE "createdAt" >= v_actual_start AND "createdAt" < v_actual_end
  ) t;

  RETURN jsonb_build_object(
    'balance', COALESCE((v_summary->>'balance')::numeric, 0),
    'totalIncome', COALESCE((v_summary->>'totalIncome')::numeric, 0),
    'monthlyExpense', v_monthly_expense,
    'totalExpense', v_total_expense,
    'balanceBefore', v_balance_before,
    'events', v_events
  );
END;
$$;


--
-- Name: get_wallet_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_wallet_summary() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_balance NUMERIC := 0;
  v_total_income NUMERIC := 0;
  v_total_expense NUMERIC := 0;
BEGIN
  SELECT COALESCE(balance, 0), COALESCE("totalIncome", 0)
  INTO v_balance, v_total_income
  FROM "WalletSummary" WHERE id = 1;

  SELECT COALESCE(SUM(ABS(change)), 0) INTO v_total_expense
  FROM "FinancialEvent" WHERE change < 0;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'totalIncome', v_total_income,
    'totalExpense', v_total_expense
  );
END;
$$;


--
-- Name: increment_daily_visitor_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_daily_visitor_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO visitor_daily_counts (date, visit_count)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (date)
  DO UPDATE SET visit_count = visitor_daily_counts.visit_count + 1;
  RETURN NULL;
END;
$$;


--
-- Name: increment_visitors(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_visitors(count integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE "SiteStats"
  SET total_visits = total_visits + count
  WHERE id = 1;
END;
$$;


--
-- Name: prune_visitor_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_visitor_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM public.visitor_log
  WHERE id IN (
    SELECT id FROM public.visitor_log
    ORDER BY visited_at ASC
    LIMIT GREATEST(0, (SELECT count(*) FROM public.visitor_log) - 200)
  );
  RETURN NULL;
END;
$$;


--
-- Name: update_admin_schedule(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_admin_schedule(schedule jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  day_record jsonb;
BEGIN
  FOR day_record IN SELECT * FROM jsonb_array_elements(schedule)
  LOOP
    UPDATE "AdminSchedule"
    SET
      work_parts_count = (day_record->>'work_parts_count')::int,
      part1_start = day_record->>'part1_start',
      part1_end   = day_record->>'part1_end',
      part2_start = day_record->>'part2_start',
      part2_end   = day_record->>'part2_end',
      part3_start = day_record->>'part3_start',
      part3_end   = day_record->>'part3_end',
      updated_at = NOW()
    WHERE day_number = (day_record->>'day_number')::int;
  END LOOP;
END;
$$;


--
-- Name: update_contact_subject_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_contact_subject_order(items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE "ContactSubject"
    SET order_index = (item->>'order_index')::int,
        updated_at = NOW()
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;


--
-- Name: update_faq_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_faq_order(items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE "Faq"
    SET order_index = (item->>'order_index')::int,
        updated_at = NOW()
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;


--
-- Name: update_gallery_category_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_gallery_category_order(items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(items) AS x(id uuid, order_index int)
  LOOP
    UPDATE "GalleryCategory"
    SET order_index = item.order_index,
        updated_at = now()
    WHERE id = item.id;
  END LOOP;
END;
$$;


--
-- Name: update_product_category_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product_category_order(items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(items) AS x(id uuid, order_index int)
  LOOP
    UPDATE "ProductCategory"
    SET order_index = item.order_index,
        updated_at = now()
    WHERE id = item.id;
  END LOOP;
END;
$$;


--
-- Name: update_service_order(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_service_order(items jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE "Service"
    SET order_index = (item->>'order_index')::int,
        updated_at = NOW()
    WHERE id = (item->>'id')::uuid;
  END LOOP;
  RETURN true;
END;
$$;


--
-- Name: update_wallet_summary(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_wallet_summary(change_val numeric) RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE "WalletSummary"
  SET balance = balance + change_val,
      "totalIncome" = "totalIncome" + CASE WHEN change_val > 0 THEN change_val ELSE 0 END,
      "updatedAt" = now()
  WHERE id = 1;
$$;


--
-- Name: upsert_visitor_location(text, text, double precision, double precision, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_visitor_location(p_country text, p_city text, p_lat double precision, p_lon double precision, p_last_visited_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO visitor_locations (country, city, lat, lon, visit_count, last_visited_at)
  VALUES (p_country, p_city, p_lat, p_lon, 1, p_last_visited_at)
  ON CONFLICT (country, city)
  DO UPDATE SET
    visit_count = visitor_locations.visit_count + 1,
    last_visited_at = EXCLUDED.last_visited_at;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AboutContent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AboutContent" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_fr text,
    content_ar text,
    updated_at timestamp with time zone DEFAULT now(),
    summary_fr text,
    summary_ar text,
    image_url text,
    image_public_id text
);


--
-- Name: AdminSchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminSchedule" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_number integer NOT NULL,
    day_name_fr text NOT NULL,
    day_name_ar text NOT NULL,
    work_parts_count integer DEFAULT 0,
    part1_start text,
    part1_end text,
    part2_start text,
    part2_end text,
    part3_start text,
    part3_end text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: AdminSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminSettings" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lock_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "userId" uuid,
    action text NOT NULL,
    resource text NOT NULL,
    "resourceId" text,
    "ipAddress" text NOT NULL,
    "userAgent" text NOT NULL,
    "tailscaleIp" text,
    "deviceFingerprint" text,
    success boolean NOT NULL,
    "errorMessage" text,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: Booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Booking" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    service_type text,
    custom_service text,
    desired_date timestamp with time zone,
    duration_minutes integer,
    children_count integer DEFAULT 1 NOT NULL,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text NOT NULL,
    notes text,
    image_url text,
    cloudinary_public_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    total_price numeric,
    payment_status text DEFAULT 'pending'::text,
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
    payment_amount numeric(10,2),
    payment_currency text,
    CONSTRAINT "Booking_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]))),
    CONSTRAINT "Booking_status_check1" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'rescheduled'::text]))),
    CONSTRAINT "Booking_type_check1" CHECK ((type = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: Brand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Brand" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    logo_url text NOT NULL,
    website_url text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description_fr text,
    description_ar text,
    name_fr text,
    name_ar text,
    image_public_id text
);


--
-- Name: Challenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Challenge" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title_fr text DEFAULT ''::text NOT NULL,
    title_ar text DEFAULT ''::text NOT NULL,
    html_code text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ContactInfo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactInfo" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    address text,
    email text,
    phone text,
    updated_at timestamp with time zone DEFAULT now(),
    latitude numeric(10,8),
    longitude numeric(11,8),
    map_zoom integer DEFAULT 15,
    social_links jsonb DEFAULT '{}'::jsonb
);


--
-- Name: ContactSubject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactSubject" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title_fr text NOT NULL,
    title_ar text NOT NULL,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    is_other boolean DEFAULT false,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: CronSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CronSetting" (
    name text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: Event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Event" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "titleFr" text NOT NULL,
    "titleAr" text NOT NULL,
    "descriptionFr" text NOT NULL,
    "descriptionAr" text NOT NULL,
    date timestamp with time zone NOT NULL,
    "imageUrl" text,
    location text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone,
    "endDate" timestamp with time zone,
    "autoDeleteDate" timestamp with time zone,
    auto_display boolean DEFAULT true,
    "imagePublicId" text
);


--
-- Name: Faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Faq" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_fr text NOT NULL,
    question_ar text NOT NULL,
    answer_fr text DEFAULT ''::text NOT NULL,
    answer_ar text DEFAULT ''::text NOT NULL,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: FeatureFlag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FeatureFlag" (
    feature_name text NOT NULL,
    is_enabled boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: FinancialEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FinancialEvent" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    "sourceId" uuid,
    field text,
    "oldValue" numeric DEFAULT 0,
    "newValue" numeric DEFAULT 0,
    change numeric NOT NULL,
    description text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "FinancialEvent_source_check" CHECK ((source = ANY (ARRAY['worker'::text, 'expense'::text, 'tool'::text, 'manual'::text])))
);

ALTER TABLE ONLY public."FinancialEvent" FORCE ROW LEVEL SECURITY;


--
-- Name: FixedExpense; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FixedExpense" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public."FixedExpense" FORCE ROW LEVEL SECURITY;


--
-- Name: GalleryCategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GalleryCategory" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name_fr text NOT NULL,
    name_ar text NOT NULL,
    slug text NOT NULL,
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


--
-- Name: GalleryItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GalleryItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    title_fr text NOT NULL,
    title_ar text NOT NULL,
    description_fr text,
    description_ar text,
    media_url text NOT NULL,
    is_gif boolean DEFAULT false,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    media_type text DEFAULT 'image'::text,
    deleted_at timestamp with time zone,
    image_public_id text,
    CONSTRAINT "GalleryItem_media_type_check" CHECK ((media_type = ANY (ARRAY['image'::text, 'gif'::text, 'video'::text])))
);


--
-- Name: Goal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Goal" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title_fr text NOT NULL,
    title_ar text NOT NULL,
    current_value numeric DEFAULT 0,
    target_value numeric DEFAULT 100,
    unit text,
    icon_url text,
    start_date date,
    end_date date,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: HeroSlide; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HeroSlide" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text NOT NULL,
    title_fr text,
    title_ar text,
    subtitle_fr text,
    subtitle_ar text,
    button_text_fr text,
    button_text_ar text,
    button_link text,
    show_floating_buttons boolean DEFAULT false,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_public_id text
);


--
-- Name: KeyFigure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KeyFigure" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_fr text NOT NULL,
    name_ar text NOT NULL,
    value text NOT NULL,
    icon_url text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    description_fr text DEFAULT ''::text,
    description_ar text DEFAULT ''::text,
    deleted_at timestamp with time zone,
    icon_public_id text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: Message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Message" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    message text NOT NULL,
    status text DEFAULT 'NEW'::text,
    "adminNotes" text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "repliedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone,
    subject_id uuid,
    custom_subject text,
    deleted_at timestamp with time zone,
    CONSTRAINT "Message_status_check" CHECK ((status = ANY (ARRAY['NEW'::text, 'READ'::text, 'REPLIED'::text])))
);


--
-- Name: NewsletterSubscriber; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NewsletterSubscriber" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    phone text,
    subscribed_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    reference text,
    title text,
    message text,
    status text DEFAULT 'unread'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "readAt" timestamp with time zone
);


--
-- Name: Order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Order" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_reference text NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    customer_name text NOT NULL,
    contact_email text,
    contact_phone text,
    shipping_address text,
    notes text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderItem" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    product_id uuid,
    product_name text,
    quantity integer DEFAULT 1,
    unit_price numeric(10,2),
    total_price numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: Product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Product" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name_fr text NOT NULL,
    name_ar text NOT NULL,
    slug text NOT NULL,
    description_fr text,
    description_ar text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    compare_at_price numeric(10,2),
    discount_percentage integer,
    discount_start_date timestamp with time zone,
    discount_end_date timestamp with time zone,
    stock_quantity integer DEFAULT 0,
    sku text,
    image_url text,
    is_recommended boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_limited boolean DEFAULT false,
    original_discount_percentage integer,
    image_public_id text,
    deleted_at timestamp with time zone,
    show_original_price boolean DEFAULT false,
    CONSTRAINT "Product_discount_percentage_check" CHECK (((discount_percentage >= 0) AND (discount_percentage <= 100)))
);


--
-- Name: ProductCategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductCategory" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name_fr text NOT NULL,
    name_ar text NOT NULL,
    slug text NOT NULL,
    description_fr text,
    description_ar text,
    image_url text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_public_id text
);


--
-- Name: ProductImage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProductImage" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    url text NOT NULL,
    is_gif boolean DEFAULT false,
    is_primary boolean DEFAULT false,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    public_id text
);


--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RefreshToken" (
    "familyId" text NOT NULL,
    token text NOT NULL,
    kind text DEFAULT 'current'::text NOT NULL,
    "userId" text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "revokedAt" timestamp with time zone,
    "familyData" jsonb NOT NULL,
    CONSTRAINT "RefreshToken_kind_check" CHECK ((kind = ANY (ARRAY['current'::text, 'previous'::text])))
);


--
-- Name: SecretCode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SecretCode" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    purpose text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: Service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Service" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title_fr text NOT NULL,
    title_ar text NOT NULL,
    description_fr text NOT NULL,
    description_ar text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url text,
    link_url text,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    image_public_id text
);


--
-- Name: ServiceType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ServiceType" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_fr text NOT NULL,
    name_ar text NOT NULL,
    duration_minutes integer NOT NULL,
    calcom_slug text NOT NULL,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    calcom_id bigint,
    duration integer,
    price numeric(10,2),
    currency text DEFAULT 'USD'::text,
    locations jsonb,
    requires_confirmation boolean DEFAULT false,
    is_active boolean DEFAULT true,
    description_fr text,
    description_ar text,
    translated_at timestamp with time zone,
    slug text,
    calcom_title text,
    calcom_description text,
    calcom_data_hash text,
    is_other boolean DEFAULT false,
    deleted_at timestamp with time zone,
    calcom_updated_at timestamp with time zone
);


--
-- Name: Session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Session" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    "userId" uuid,
    "deviceFingerprint" text NOT NULL,
    "ipAddress" text NOT NULL,
    "geoLocation" jsonb,
    "userAgent" text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "expiredAt" timestamp with time zone,
    "tailscaleIp" text
);


--
-- Name: SiteData; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SiteData" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name_fr text DEFAULT 'Kafela'::text NOT NULL,
    name_ar text DEFAULT 'كافيلا'::text NOT NULL,
    logo_url text,
    favicon_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    slogans_fr jsonb DEFAULT '["Choisi par les parents", "Adoré par les enfants"]'::jsonb,
    slogans_ar jsonb DEFAULT '["مختار من قبل الآباء", "محبوب من قبل الأطفال"]'::jsonb,
    logo_public_id text,
    favicon_public_id text
);


--
-- Name: SiteImages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SiteImages" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text,
    alt_fr text DEFAULT ''::text,
    alt_ar text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_public_id text
);


--
-- Name: SiteStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SiteStats" (
    id integer DEFAULT 1 NOT NULL,
    total_visits bigint DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TermsContent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TermsContent" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tab text NOT NULL,
    content_fr text DEFAULT ''::text NOT NULL,
    content_ar text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: Tool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tool" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    quantity integer NOT NULL,
    "usageDate" date NOT NULL,
    state text NOT NULL,
    notes text DEFAULT ''::text,
    "createdAt" timestamp with time zone DEFAULT now(),
    price numeric DEFAULT 0,
    CONSTRAINT "Tool_quantity_check" CHECK ((quantity > 0))
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    role text DEFAULT 'USER'::text,
    "tailscaleIp" text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "lastLoginAt" timestamp with time zone,
    "twoFactorEnabled" boolean DEFAULT false,
    "fullName" text DEFAULT 'Admin'::text,
    "passwordChangedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "User_role_check" CHECK ((role = ANY (ARRAY['USER'::text, 'ADMIN'::text])))
);


--
-- Name: UserSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserSettings" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    weather_mode text DEFAULT 'ip'::text NOT NULL,
    weather_geo jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT "UserSettings_weather_mode_check" CHECK ((weather_mode = ANY (ARRAY['ip'::text, 'geo'::text])))
);


--
-- Name: VisitorLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VisitorLog" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip text NOT NULL,
    country text,
    city text,
    region text,
    latitude double precision,
    longitude double precision,
    timezone text,
    visited_at timestamp with time zone DEFAULT now()
);


--
-- Name: WalletEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WalletEntry" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: WalletSummary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WalletSummary" (
    id integer DEFAULT 1 NOT NULL,
    balance numeric DEFAULT 0,
    "totalIncome" numeric DEFAULT 0,
    "updatedAt" timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public."WalletSummary" FORCE ROW LEVEL SECURITY;


--
-- Name: WhyChooseUs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WhyChooseUs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title_fr text NOT NULL,
    title_ar text NOT NULL,
    description_fr text DEFAULT ''::text NOT NULL,
    description_ar text DEFAULT ''::text NOT NULL,
    order_index integer DEFAULT 0,
    is_active boolean DEFAULT true,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: Worker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Worker" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    email text NOT NULL,
    address text NOT NULL,
    role text NOT NULL,
    phone text NOT NULL,
    notes text DEFAULT ''::text,
    "joinedAt" timestamp with time zone DEFAULT now(),
    "isActive" boolean DEFAULT true,
    salary numeric NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public."Worker" FORCE ROW LEVEL SECURITY;


--
-- Name: backup_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity text NOT NULL,
    action text NOT NULL,
    record_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    synced_at timestamp with time zone
);


--
-- Name: backup_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_sync_state (
    entity text NOT NULL,
    last_synced_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: category_attribute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_attribute (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    discount_percentage integer,
    is_limited boolean DEFAULT false,
    CONSTRAINT category_attribute_discount_percentage_check CHECK (((discount_percentage >= 0) AND (discount_percentage <= 100)))
);


--
-- Name: visitor_daily_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_daily_counts (
    date date NOT NULL,
    visit_count integer DEFAULT 0 NOT NULL
);


--
-- Name: visitor_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country text,
    city text,
    lat double precision,
    lon double precision,
    visit_count integer DEFAULT 1 NOT NULL,
    last_visited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visitor_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip text NOT NULL,
    country text,
    city text,
    lat double precision,
    lon double precision,
    timezone text,
    visited_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AboutContent AboutContent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AboutContent"
    ADD CONSTRAINT "AboutContent_pkey" PRIMARY KEY (id);


--
-- Name: AdminSchedule AdminSchedule_day_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSchedule"
    ADD CONSTRAINT "AdminSchedule_day_number_key" UNIQUE (day_number);


--
-- Name: AdminSchedule AdminSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSchedule"
    ADD CONSTRAINT "AdminSchedule_pkey" PRIMARY KEY (id);


--
-- Name: AdminSettings AdminSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSettings"
    ADD CONSTRAINT "AdminSettings_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: Booking Booking_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_booking_id_key" UNIQUE (booking_id);


--
-- Name: Booking Booking_booking_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_booking_reference_key" UNIQUE (booking_reference);


--
-- Name: Booking Booking_calcom_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_calcom_uri_key" UNIQUE (calcom_uri);


--
-- Name: Booking Booking_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_pkey1" PRIMARY KEY (id);


--
-- Name: Brand Brand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Brand"
    ADD CONSTRAINT "Brand_pkey" PRIMARY KEY (id);


--
-- Name: Challenge Challenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Challenge"
    ADD CONSTRAINT "Challenge_pkey" PRIMARY KEY (id);


--
-- Name: ContactInfo ContactInfo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactInfo"
    ADD CONSTRAINT "ContactInfo_pkey" PRIMARY KEY (id);


--
-- Name: ContactSubject ContactSubject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactSubject"
    ADD CONSTRAINT "ContactSubject_pkey" PRIMARY KEY (id);


--
-- Name: CronSetting CronSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CronSetting"
    ADD CONSTRAINT "CronSetting_pkey" PRIMARY KEY (name);


--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);


--
-- Name: Faq Faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Faq"
    ADD CONSTRAINT "Faq_pkey" PRIMARY KEY (id);


--
-- Name: FeatureFlag FeatureFlag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FeatureFlag"
    ADD CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY (feature_name);


--
-- Name: FinancialEvent FinancialEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialEvent"
    ADD CONSTRAINT "FinancialEvent_pkey" PRIMARY KEY (id);


--
-- Name: FixedExpense FixedExpense_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FixedExpense"
    ADD CONSTRAINT "FixedExpense_pkey" PRIMARY KEY (id);


--
-- Name: GalleryCategory GalleryCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GalleryCategory"
    ADD CONSTRAINT "GalleryCategory_pkey" PRIMARY KEY (id);


--
-- Name: GalleryCategory GalleryCategory_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GalleryCategory"
    ADD CONSTRAINT "GalleryCategory_slug_key" UNIQUE (slug);


--
-- Name: GalleryItem GalleryItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GalleryItem"
    ADD CONSTRAINT "GalleryItem_pkey" PRIMARY KEY (id);


--
-- Name: Goal Goal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goal"
    ADD CONSTRAINT "Goal_pkey" PRIMARY KEY (id);


--
-- Name: HeroSlide HeroSlide_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HeroSlide"
    ADD CONSTRAINT "HeroSlide_pkey" PRIMARY KEY (id);


--
-- Name: KeyFigure KeyFigure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KeyFigure"
    ADD CONSTRAINT "KeyFigure_pkey" PRIMARY KEY (id);


--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


--
-- Name: NewsletterSubscriber NewsletterSubscriber_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NewsletterSubscriber"
    ADD CONSTRAINT "NewsletterSubscriber_email_key" UNIQUE (email);


--
-- Name: NewsletterSubscriber NewsletterSubscriber_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NewsletterSubscriber"
    ADD CONSTRAINT "NewsletterSubscriber_phone_key" UNIQUE (phone);


--
-- Name: NewsletterSubscriber NewsletterSubscriber_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NewsletterSubscriber"
    ADD CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: ProductCategory ProductCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCategory"
    ADD CONSTRAINT "ProductCategory_pkey" PRIMARY KEY (id);


--
-- Name: ProductCategory ProductCategory_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCategory"
    ADD CONSTRAINT "ProductCategory_slug_key" UNIQUE (slug);


--
-- Name: ProductImage ProductImage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_slug_key" UNIQUE (slug);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("familyId", token);


--
-- Name: SecretCode SecretCode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SecretCode"
    ADD CONSTRAINT "SecretCode_pkey" PRIMARY KEY (id);


--
-- Name: SecretCode SecretCode_purpose_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SecretCode"
    ADD CONSTRAINT "SecretCode_purpose_key" UNIQUE (purpose);


--
-- Name: ServiceType ServiceType_calcom_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ServiceType"
    ADD CONSTRAINT "ServiceType_calcom_id_key" UNIQUE (calcom_id);


--
-- Name: ServiceType ServiceType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ServiceType"
    ADD CONSTRAINT "ServiceType_pkey" PRIMARY KEY (id);


--
-- Name: ServiceType ServiceType_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ServiceType"
    ADD CONSTRAINT "ServiceType_slug_key" UNIQUE (slug);


--
-- Name: Service Service_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Service"
    ADD CONSTRAINT "Service_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: SiteData SiteData_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteData"
    ADD CONSTRAINT "SiteData_pkey" PRIMARY KEY (id);


--
-- Name: SiteImages SiteImages_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteImages"
    ADD CONSTRAINT "SiteImages_name_key" UNIQUE (name);


--
-- Name: SiteImages SiteImages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteImages"
    ADD CONSTRAINT "SiteImages_pkey" PRIMARY KEY (id);


--
-- Name: SiteStats SiteStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteStats"
    ADD CONSTRAINT "SiteStats_pkey" PRIMARY KEY (id);


--
-- Name: TermsContent TermsContent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TermsContent"
    ADD CONSTRAINT "TermsContent_pkey" PRIMARY KEY (id);


--
-- Name: TermsContent TermsContent_tab_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TermsContent"
    ADD CONSTRAINT "TermsContent_tab_key" UNIQUE (tab);


--
-- Name: Tool Tool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tool"
    ADD CONSTRAINT "Tool_pkey" PRIMARY KEY (id);


--
-- Name: UserSettings UserSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSettings"
    ADD CONSTRAINT "UserSettings_pkey" PRIMARY KEY (id);


--
-- Name: UserSettings UserSettings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSettings"
    ADD CONSTRAINT "UserSettings_user_id_key" UNIQUE (user_id);


--
-- Name: User User_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_email_key" UNIQUE (email);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VisitorLog VisitorLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VisitorLog"
    ADD CONSTRAINT "VisitorLog_pkey" PRIMARY KEY (id);


--
-- Name: WalletEntry WalletEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WalletEntry"
    ADD CONSTRAINT "WalletEntry_pkey" PRIMARY KEY (id);


--
-- Name: WalletSummary WalletSummary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WalletSummary"
    ADD CONSTRAINT "WalletSummary_pkey" PRIMARY KEY (id);


--
-- Name: WhyChooseUs WhyChooseUs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhyChooseUs"
    ADD CONSTRAINT "WhyChooseUs_pkey" PRIMARY KEY (id);


--
-- Name: Worker Worker_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Worker"
    ADD CONSTRAINT "Worker_email_key" UNIQUE (email);


--
-- Name: Worker Worker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Worker"
    ADD CONSTRAINT "Worker_pkey" PRIMARY KEY (id);


--
-- Name: backup_outbox backup_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_outbox
    ADD CONSTRAINT backup_outbox_pkey PRIMARY KEY (id);


--
-- Name: backup_sync_state backup_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_sync_state
    ADD CONSTRAINT backup_sync_state_pkey PRIMARY KEY (entity);


--
-- Name: category_attribute category_attribute_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_attribute
    ADD CONSTRAINT category_attribute_category_id_key UNIQUE (category_id);


--
-- Name: category_attribute category_attribute_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_attribute
    ADD CONSTRAINT category_attribute_pkey PRIMARY KEY (id);


--
-- Name: Session session_user_device_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT session_user_device_unique UNIQUE ("userId", "deviceFingerprint");


--
-- Name: Booking unique_calcom_uri; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT unique_calcom_uri UNIQUE (calcom_uri);


--
-- Name: AdminSchedule unique_day_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminSchedule"
    ADD CONSTRAINT unique_day_number UNIQUE (day_number);


--
-- Name: Product unique_product_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT unique_product_slug UNIQUE (slug);


--
-- Name: ServiceType unique_service_type_calcom_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ServiceType"
    ADD CONSTRAINT unique_service_type_calcom_slug UNIQUE (calcom_slug);


--
-- Name: visitor_daily_counts visitor_daily_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_daily_counts
    ADD CONSTRAINT visitor_daily_counts_pkey PRIMARY KEY (date);


--
-- Name: visitor_locations visitor_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_locations
    ADD CONSTRAINT visitor_locations_pkey PRIMARY KEY (id);


--
-- Name: visitor_log visitor_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_log
    ADD CONSTRAINT visitor_log_pkey PRIMARY KEY (id);


--
-- Name: AuditLog_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_action_idx" ON public."AuditLog" USING btree (action);


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt" DESC);


--
-- Name: AuditLog_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_userId_idx" ON public."AuditLog" USING btree ("userId");


--
-- Name: Event_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_date_idx" ON public."Event" USING btree (date);


--
-- Name: Message_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Message_status_idx" ON public."Message" USING btree (status);


--
-- Name: Session_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_expiresAt_idx" ON public."Session" USING btree ("expiresAt");


--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");


--
-- Name: idx_auditlog_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditlog_action ON public."AuditLog" USING btree (action);


--
-- Name: idx_auditlog_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditlog_created ON public."AuditLog" USING btree ("createdAt");


--
-- Name: idx_auditlog_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditlog_resource ON public."AuditLog" USING btree (resource);


--
-- Name: idx_auditlog_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditlog_user ON public."AuditLog" USING btree ("userId");


--
-- Name: idx_backup_outbox_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backup_outbox_status ON public.backup_outbox USING btree (status);


--
-- Name: idx_booking_calcom_uri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_calcom_uri ON public."Booking" USING btree (calcom_uri);


--
-- Name: idx_booking_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_reference ON public."Booking" USING btree (booking_reference);


--
-- Name: idx_booking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_token ON public."Booking" USING btree (token);


--
-- Name: idx_brand_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_order ON public."Brand" USING btree (order_index, is_active);


--
-- Name: idx_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_date ON public."Event" USING btree (date);


--
-- Name: idx_fin_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_event_created ON public."FinancialEvent" USING btree ("createdAt");


--
-- Name: idx_fin_event_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_event_source ON public."FinancialEvent" USING btree (source, "sourceId");


--
-- Name: idx_financial_event_createdat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_event_createdat ON public."FinancialEvent" USING btree ("createdAt");


--
-- Name: idx_hero_slide_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hero_slide_order ON public."HeroSlide" USING btree (order_index, is_active);


--
-- Name: idx_message_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_created ON public."Message" USING btree ("createdAt");


--
-- Name: idx_message_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_status ON public."Message" USING btree (status);


--
-- Name: idx_notification_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_type_status ON public."Notification" USING btree (type, status);


--
-- Name: idx_refresh_family_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_family_id ON public."RefreshToken" USING btree ("familyId") WHERE ("revokedAt" IS NULL);


--
-- Name: idx_refresh_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_user_id ON public."RefreshToken" USING btree ("userId") WHERE ("revokedAt" IS NULL);


--
-- Name: idx_service_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_order ON public."Service" USING btree (order_index, is_active);


--
-- Name: idx_service_type_calcom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_type_calcom_id ON public."ServiceType" USING btree (calcom_id);


--
-- Name: idx_service_types_calcom_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_types_calcom_id ON public."ServiceType" USING btree (calcom_id);


--
-- Name: idx_session_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_expires ON public."Session" USING btree ("expiresAt");


--
-- Name: idx_session_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_user ON public."Session" USING btree ("userId");


--
-- Name: idx_visitor_locations_city; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_visitor_locations_city ON public.visitor_locations USING btree (country, city);


--
-- Name: idx_visitor_log_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_log_visited_at ON public.visitor_log USING btree (visited_at);


--
-- Name: idx_visitorlog_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitorlog_visited_at ON public."VisitorLog" USING btree (visited_at DESC);


--
-- Name: visitor_log trigger_increment_daily_visitor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_increment_daily_visitor AFTER INSERT ON public.visitor_log FOR EACH ROW EXECUTE FUNCTION public.increment_daily_visitor_count();


--
-- Name: visitor_log trigger_prune_visitor_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_prune_visitor_log AFTER INSERT ON public.visitor_log FOR EACH STATEMENT EXECUTE FUNCTION public.prune_visitor_log();


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: Booking Booking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(id);


--
-- Name: GalleryCategory GalleryCategory_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GalleryCategory"
    ADD CONSTRAINT "GalleryCategory_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public."GalleryCategory"(id) ON DELETE CASCADE;


--
-- Name: GalleryItem GalleryItem_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GalleryItem"
    ADD CONSTRAINT "GalleryItem_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public."GalleryCategory"(id) ON DELETE SET NULL;


--
-- Name: Message Message_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES public."ContactSubject"(id);


--
-- Name: OrderItem OrderItem_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."Order"(id) ON DELETE CASCADE;


--
-- Name: ProductCategory ProductCategory_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductCategory"
    ADD CONSTRAINT "ProductCategory_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public."ProductCategory"(id) ON DELETE CASCADE;


--
-- Name: ProductImage ProductImage_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(id) ON DELETE CASCADE;


--
-- Name: Product Product_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public."ProductCategory"(id) ON DELETE SET NULL;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE;


--
-- Name: UserSettings UserSettings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserSettings"
    ADD CONSTRAINT "UserSettings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(id) ON DELETE CASCADE;


--
-- Name: category_attribute category_attribute_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_attribute
    ADD CONSTRAINT category_attribute_category_id_fkey FOREIGN KEY (category_id) REFERENCES public."ProductCategory"(id) ON DELETE CASCADE;


--
-- Name: AboutContent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AboutContent" ENABLE ROW LEVEL SECURITY;

--
-- Name: AdminSchedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AdminSchedule" ENABLE ROW LEVEL SECURITY;

--
-- Name: AdminSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AdminSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: AdminSchedule Allow admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin insert" ON public."AdminSchedule" FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: AdminSchedule Allow admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin update" ON public."AdminSchedule" FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: NewsletterSubscriber Allow public insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert" ON public."NewsletterSubscriber" FOR INSERT TO anon WITH CHECK (true);


--
-- Name: AdminSchedule Allow public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read" ON public."AdminSchedule" FOR SELECT USING (true);


--
-- Name: AdminSchedule Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public."AdminSchedule" FOR SELECT USING (true);


--
-- Name: NewsletterSubscriber Allow public select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select" ON public."NewsletterSubscriber" FOR SELECT TO anon USING (true);


--
-- Name: AuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: Brand; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Brand" ENABLE ROW LEVEL SECURITY;

--
-- Name: Challenge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Challenge" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactInfo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactInfo" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactSubject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactSubject" ENABLE ROW LEVEL SECURITY;

--
-- Name: CronSetting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CronSetting" ENABLE ROW LEVEL SECURITY;

--
-- Name: Event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Event" ENABLE ROW LEVEL SECURITY;

--
-- Name: Faq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Faq" ENABLE ROW LEVEL SECURITY;

--
-- Name: FeatureFlag; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FeatureFlag" ENABLE ROW LEVEL SECURITY;

--
-- Name: FinancialEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FinancialEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: FixedExpense; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FixedExpense" ENABLE ROW LEVEL SECURITY;

--
-- Name: GalleryCategory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GalleryCategory" ENABLE ROW LEVEL SECURITY;

--
-- Name: GalleryItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GalleryItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: Goal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Goal" ENABLE ROW LEVEL SECURITY;

--
-- Name: HeroSlide; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."HeroSlide" ENABLE ROW LEVEL SECURITY;

--
-- Name: KeyFigure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."KeyFigure" ENABLE ROW LEVEL SECURITY;

--
-- Name: Message; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;

--
-- Name: NewsletterSubscriber; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;

--
-- Name: Notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

--
-- Name: Order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: Product; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProductCategory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProductCategory" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProductImage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProductImage" ENABLE ROW LEVEL SECURITY;

--
-- Name: AboutContent Public can read about; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read about" ON public."AboutContent" FOR SELECT USING (true);


--
-- Name: Brand Public can read active brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active brands" ON public."Brand" FOR SELECT USING ((is_active = true));


--
-- Name: GalleryCategory Public can read active gallery categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active gallery categories" ON public."GalleryCategory" FOR SELECT USING ((is_active = true));


--
-- Name: GalleryItem Public can read active gallery items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active gallery items" ON public."GalleryItem" FOR SELECT USING ((is_active = true));


--
-- Name: ProductCategory Public can read active product categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active product categories" ON public."ProductCategory" FOR SELECT USING ((is_active = true));


--
-- Name: Product Public can read active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active products" ON public."Product" FOR SELECT USING ((is_active = true));


--
-- Name: Service Public can read active services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active services" ON public."Service" FOR SELECT USING ((is_active = true));


--
-- Name: HeroSlide Public can read active slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read active slides" ON public."HeroSlide" FOR SELECT USING ((is_active = true));


--
-- Name: ProductImage Public can read product images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read product images" ON public."ProductImage" FOR SELECT USING (true);


--
-- Name: WhyChooseUs Public can view active tabs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active tabs" ON public."WhyChooseUs" FOR SELECT USING ((is_active = true));


--
-- Name: TermsContent Public can view terms content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view terms content" ON public."TermsContent" FOR SELECT USING (true);


--
-- Name: ContactInfo Public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read" ON public."ContactInfo" FOR SELECT USING (true);


--
-- Name: ContactInfo Public read access for ContactInfo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access for ContactInfo" ON public."ContactInfo" FOR SELECT USING (true);


--
-- Name: RefreshToken; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RefreshToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: SecretCode; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SecretCode" ENABLE ROW LEVEL SECURITY;

--
-- Name: Service; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Service" ENABLE ROW LEVEL SECURITY;

--
-- Name: AuditLog Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public."AuditLog" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Event Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public."Event" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Message Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public."Message" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Session Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public."Session" TO service_role USING (true) WITH CHECK (true);


--
-- Name: User Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public."User" TO service_role USING (true) WITH CHECK (true);


--
-- Name: AuditLog Service role full access on AuditLog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on AuditLog" ON public."AuditLog" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Event Service role full access on Event; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on Event" ON public."Event" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Message Service role full access on Message; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on Message" ON public."Message" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Session Service role full access on Session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on Session" ON public."Session" TO service_role USING (true) WITH CHECK (true);


--
-- Name: User Service role full access on User; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on User" ON public."User" TO service_role USING (true) WITH CHECK (true);


--
-- Name: Session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;

--
-- Name: SiteData; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SiteData" ENABLE ROW LEVEL SECURITY;

--
-- Name: SiteImages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SiteImages" ENABLE ROW LEVEL SECURITY;

--
-- Name: SiteStats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SiteStats" ENABLE ROW LEVEL SECURITY;

--
-- Name: TermsContent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TermsContent" ENABLE ROW LEVEL SECURITY;

--
-- Name: Tool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Tool" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: UserSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."UserSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: VisitorLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."VisitorLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: WalletEntry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WalletEntry" ENABLE ROW LEVEL SECURITY;

--
-- Name: WalletSummary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WalletSummary" ENABLE ROW LEVEL SECURITY;

--
-- Name: WhyChooseUs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WhyChooseUs" ENABLE ROW LEVEL SECURITY;

--
-- Name: Worker; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Worker" ENABLE ROW LEVEL SECURITY;

--
-- Name: backup_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backup_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: backup_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backup_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: category_attribute; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_attribute ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_daily_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_daily_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_log ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- Name: FUNCTION atomic_delete_worker_with_salary_event(p_id uuid, p_event_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.atomic_delete_worker_with_salary_event(p_id uuid, p_event_description text) TO service_role;


--
-- Name: FUNCTION atomic_log_financial_event(p_source text, p_source_id uuid, p_field text, p_old_value numeric, p_new_value numeric, p_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.atomic_log_financial_event(p_source text, p_source_id uuid, p_field text, p_old_value numeric, p_new_value numeric, p_description text) TO service_role;


--
-- Name: FUNCTION atomic_update_worker(p_id text, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_salary numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.atomic_update_worker(p_id text, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_salary numeric) TO service_role;


--
-- Name: FUNCTION atomic_update_worker_with_salary_event(p_id uuid, p_expected_version integer, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_new_salary numeric, p_event_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.atomic_update_worker_with_salary_event(p_id uuid, p_expected_version integer, p_expected_salary numeric, p_first_name text, p_last_name text, p_email text, p_address text, p_role text, p_phone text, p_notes text, p_is_active boolean, p_new_salary numeric, p_event_description text) TO service_role;


--
-- Name: FUNCTION financial_event_exists_in_month(p_source text, p_source_id uuid, p_month_start timestamp with time zone, p_month_end timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.financial_event_exists_in_month(p_source text, p_source_id uuid, p_month_start timestamp with time zone, p_month_end timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_wallet_bounds(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_wallet_bounds() TO service_role;


--
-- Name: FUNCTION get_wallet_data(p_start timestamp with time zone, p_end timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_wallet_data(p_start timestamp with time zone, p_end timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_wallet_summary(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_wallet_summary() TO service_role;


--
-- Name: TABLE "AboutContent"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AboutContent" TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AboutContent" TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."AboutContent" TO service_role;


--
-- Name: TABLE "AdminSchedule"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."AdminSchedule" TO service_role;
GRANT SELECT ON TABLE public."AdminSchedule" TO anon;
GRANT SELECT ON TABLE public."AdminSchedule" TO authenticated;


--
-- Name: TABLE "AdminSettings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."AdminSettings" TO anon;
GRANT ALL ON TABLE public."AdminSettings" TO authenticated;
GRANT ALL ON TABLE public."AdminSettings" TO service_role;


--
-- Name: TABLE "AuditLog"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."AuditLog" TO authenticated;
GRANT ALL ON TABLE public."AuditLog" TO service_role;
GRANT ALL ON TABLE public."AuditLog" TO anon;


--
-- Name: TABLE "Booking"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Booking" TO service_role;


--
-- Name: TABLE "Brand"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Brand" TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Brand" TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Brand" TO service_role;


--
-- Name: TABLE "Challenge"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Challenge" TO anon;
GRANT ALL ON TABLE public."Challenge" TO authenticated;
GRANT ALL ON TABLE public."Challenge" TO service_role;


--
-- Name: TABLE "ContactInfo"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."ContactInfo" TO service_role;
GRANT SELECT ON TABLE public."ContactInfo" TO anon;
GRANT SELECT ON TABLE public."ContactInfo" TO authenticated;


--
-- Name: TABLE "ContactSubject"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."ContactSubject" TO anon;
GRANT ALL ON TABLE public."ContactSubject" TO authenticated;
GRANT ALL ON TABLE public."ContactSubject" TO service_role;


--
-- Name: TABLE "CronSetting"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."CronSetting" TO anon;
GRANT ALL ON TABLE public."CronSetting" TO authenticated;
GRANT ALL ON TABLE public."CronSetting" TO service_role;


--
-- Name: TABLE "Event"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Event" TO authenticated;
GRANT ALL ON TABLE public."Event" TO service_role;
GRANT ALL ON TABLE public."Event" TO anon;


--
-- Name: TABLE "Faq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Faq" TO anon;
GRANT ALL ON TABLE public."Faq" TO authenticated;
GRANT ALL ON TABLE public."Faq" TO service_role;


--
-- Name: TABLE "FeatureFlag"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."FeatureFlag" TO anon;
GRANT ALL ON TABLE public."FeatureFlag" TO authenticated;
GRANT ALL ON TABLE public."FeatureFlag" TO service_role;


--
-- Name: TABLE "FinancialEvent"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."FinancialEvent" TO anon;
GRANT ALL ON TABLE public."FinancialEvent" TO authenticated;
GRANT ALL ON TABLE public."FinancialEvent" TO service_role;


--
-- Name: TABLE "FixedExpense"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."FixedExpense" TO anon;
GRANT ALL ON TABLE public."FixedExpense" TO authenticated;
GRANT ALL ON TABLE public."FixedExpense" TO service_role;


--
-- Name: TABLE "GalleryCategory"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."GalleryCategory" TO anon;
GRANT ALL ON TABLE public."GalleryCategory" TO authenticated;
GRANT ALL ON TABLE public."GalleryCategory" TO service_role;


--
-- Name: TABLE "GalleryItem"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."GalleryItem" TO anon;
GRANT ALL ON TABLE public."GalleryItem" TO authenticated;
GRANT ALL ON TABLE public."GalleryItem" TO service_role;


--
-- Name: TABLE "Goal"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Goal" TO anon;
GRANT ALL ON TABLE public."Goal" TO authenticated;
GRANT ALL ON TABLE public."Goal" TO service_role;


--
-- Name: TABLE "HeroSlide"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."HeroSlide" TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."HeroSlide" TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."HeroSlide" TO service_role;


--
-- Name: TABLE "KeyFigure"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."KeyFigure" TO anon;
GRANT ALL ON TABLE public."KeyFigure" TO authenticated;
GRANT ALL ON TABLE public."KeyFigure" TO service_role;


--
-- Name: TABLE "Message"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Message" TO authenticated;
GRANT ALL ON TABLE public."Message" TO service_role;
GRANT ALL ON TABLE public."Message" TO anon;


--
-- Name: TABLE "NewsletterSubscriber"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."NewsletterSubscriber" TO anon;
GRANT ALL ON TABLE public."NewsletterSubscriber" TO authenticated;
GRANT ALL ON TABLE public."NewsletterSubscriber" TO service_role;


--
-- Name: TABLE "Notification"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Notification" TO anon;
GRANT ALL ON TABLE public."Notification" TO authenticated;
GRANT ALL ON TABLE public."Notification" TO service_role;


--
-- Name: TABLE "Order"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Order" TO anon;
GRANT ALL ON TABLE public."Order" TO authenticated;
GRANT ALL ON TABLE public."Order" TO service_role;


--
-- Name: TABLE "OrderItem"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."OrderItem" TO anon;
GRANT ALL ON TABLE public."OrderItem" TO authenticated;
GRANT ALL ON TABLE public."OrderItem" TO service_role;


--
-- Name: TABLE "Product"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Product" TO anon;
GRANT ALL ON TABLE public."Product" TO authenticated;
GRANT ALL ON TABLE public."Product" TO service_role;


--
-- Name: TABLE "ProductCategory"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."ProductCategory" TO anon;
GRANT ALL ON TABLE public."ProductCategory" TO authenticated;
GRANT ALL ON TABLE public."ProductCategory" TO service_role;


--
-- Name: TABLE "ProductImage"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."ProductImage" TO anon;
GRANT ALL ON TABLE public."ProductImage" TO authenticated;
GRANT ALL ON TABLE public."ProductImage" TO service_role;


--
-- Name: TABLE "RefreshToken"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."RefreshToken" TO anon;
GRANT ALL ON TABLE public."RefreshToken" TO authenticated;
GRANT ALL ON TABLE public."RefreshToken" TO service_role;


--
-- Name: TABLE "SecretCode"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."SecretCode" TO anon;
GRANT ALL ON TABLE public."SecretCode" TO authenticated;
GRANT ALL ON TABLE public."SecretCode" TO service_role;


--
-- Name: TABLE "Service"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Service" TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Service" TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."Service" TO service_role;


--
-- Name: TABLE "ServiceType"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."ServiceType" TO service_role;


--
-- Name: TABLE "Session"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Session" TO authenticated;
GRANT ALL ON TABLE public."Session" TO service_role;
GRANT ALL ON TABLE public."Session" TO anon;


--
-- Name: TABLE "SiteData"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."SiteData" TO anon;
GRANT ALL ON TABLE public."SiteData" TO authenticated;
GRANT ALL ON TABLE public."SiteData" TO service_role;


--
-- Name: TABLE "SiteImages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."SiteImages" TO anon;
GRANT ALL ON TABLE public."SiteImages" TO authenticated;
GRANT ALL ON TABLE public."SiteImages" TO service_role;


--
-- Name: TABLE "SiteStats"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."SiteStats" TO anon;
GRANT ALL ON TABLE public."SiteStats" TO authenticated;
GRANT ALL ON TABLE public."SiteStats" TO service_role;


--
-- Name: TABLE "TermsContent"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."TermsContent" TO anon;
GRANT ALL ON TABLE public."TermsContent" TO authenticated;
GRANT ALL ON TABLE public."TermsContent" TO service_role;


--
-- Name: TABLE "Tool"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Tool" TO anon;
GRANT ALL ON TABLE public."Tool" TO authenticated;
GRANT ALL ON TABLE public."Tool" TO service_role;


--
-- Name: TABLE "User"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."User" TO authenticated;
GRANT ALL ON TABLE public."User" TO service_role;
GRANT ALL ON TABLE public."User" TO anon;


--
-- Name: TABLE "UserSettings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."UserSettings" TO anon;
GRANT ALL ON TABLE public."UserSettings" TO authenticated;
GRANT ALL ON TABLE public."UserSettings" TO service_role;


--
-- Name: TABLE "VisitorLog"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."VisitorLog" TO anon;
GRANT ALL ON TABLE public."VisitorLog" TO authenticated;
GRANT ALL ON TABLE public."VisitorLog" TO service_role;


--
-- Name: TABLE "WalletEntry"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."WalletEntry" TO anon;
GRANT ALL ON TABLE public."WalletEntry" TO authenticated;
GRANT ALL ON TABLE public."WalletEntry" TO service_role;


--
-- Name: TABLE "WalletSummary"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."WalletSummary" TO anon;
GRANT ALL ON TABLE public."WalletSummary" TO authenticated;
GRANT ALL ON TABLE public."WalletSummary" TO service_role;


--
-- Name: TABLE "WhyChooseUs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."WhyChooseUs" TO anon;
GRANT ALL ON TABLE public."WhyChooseUs" TO authenticated;
GRANT ALL ON TABLE public."WhyChooseUs" TO service_role;


--
-- Name: TABLE "Worker"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public."Worker" TO anon;
GRANT ALL ON TABLE public."Worker" TO authenticated;
GRANT ALL ON TABLE public."Worker" TO service_role;


--
-- Name: TABLE backup_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backup_outbox TO anon;
GRANT ALL ON TABLE public.backup_outbox TO authenticated;
GRANT ALL ON TABLE public.backup_outbox TO service_role;


--
-- Name: TABLE backup_sync_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backup_sync_state TO anon;
GRANT ALL ON TABLE public.backup_sync_state TO authenticated;
GRANT ALL ON TABLE public.backup_sync_state TO service_role;


--
-- Name: TABLE category_attribute; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.category_attribute TO anon;
GRANT ALL ON TABLE public.category_attribute TO authenticated;
GRANT ALL ON TABLE public.category_attribute TO service_role;


--
-- Name: TABLE visitor_daily_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visitor_daily_counts TO anon;
GRANT ALL ON TABLE public.visitor_daily_counts TO authenticated;
GRANT ALL ON TABLE public.visitor_daily_counts TO service_role;


--
-- Name: TABLE visitor_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visitor_locations TO anon;
GRANT ALL ON TABLE public.visitor_locations TO authenticated;
GRANT ALL ON TABLE public.visitor_locations TO service_role;


--
-- Name: TABLE visitor_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visitor_log TO anon;
GRANT ALL ON TABLE public.visitor_log TO authenticated;
GRANT ALL ON TABLE public.visitor_log TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict ZvoX4hFWKIysUYtzZgQx3qx5tt1tHGcDckLc24XJCrJFqvb2lBGoVMqKMXmElbq

