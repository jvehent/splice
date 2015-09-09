from contextlib import contextmanager
from datetime import datetime, timedelta
from sqlalchemy.sql import text
from splice.models import Channel, Distribution, Tile, Adgroup, AdgroupSite, AdgroupCategory
from sqlalchemy.sql import func
from sqlalchemy.sql.expression import asc
from sqlalchemy.orm.session import sessionmaker


@contextmanager
def session_scope(conn):
    try:
        sm = sessionmaker(bind=conn)
        session = sm()
        session._model_changes = {}  # this is a workaround to make Flask-SQLAlchemy happy
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()


def get_frecent_sites_for_tile(session, tile_id):
    results = (
        session.query(AdgroupSite.site)
        .filter(AdgroupSite.adgroup_id == Adgroup.id)
        .filter(Adgroup.id == Tile.adgroup_id)
        .filter(Tile.id == tile_id)).all()
    sites = [site for site, in results]

    return sorted(set(sites))


def get_categories_for_adgroup(session, adgroup_id):
    results = (
        session.query(AdgroupCategory.category)
        .filter(AdgroupCategory.adgroup_id == adgroup_id)).all()
    categories = [category for category, in results]

    return sorted(set(categories))


def tile_exists(session, target_url, bg_color, title, typ, image_uri, enhanced_image_uri, locale,
                frecent_sites, time_limits, frequency_caps, adgroup_name, adgroup_categories, explanation,
                check_inadjacency, channel_id, title_bg_color, *args, **kwargs):
    """
    Return the id of a tile having the data provided
    """
    # we add order_by in the query although it shouldn't be necessary
    # this is because of a previous bug where duplicate tiles could be created
    results = (
        session
        .query(Tile.id, Tile.adgroup_id)
        .filter(Tile.target_url == target_url)
        .filter(Tile.bg_color == bg_color)
        .filter(Tile.title_bg_color == title_bg_color)
        .filter(Tile.title == title)
        .filter(Tile.type == typ)
        .filter(Tile.image_uri == image_uri)
        .filter(Tile.enhanced_image_uri == enhanced_image_uri)
        .filter(Adgroup.locale == locale)
        .filter(Adgroup.start_date == time_limits.get('start'))
        .filter(Adgroup.end_date == time_limits.get('end'))
        .filter(Adgroup.start_date_dt == time_limits.get('start_dt'))
        .filter(Adgroup.end_date_dt == time_limits.get('end_dt'))
        .filter(Adgroup.frequency_cap_daily == frequency_caps['daily'])
        .filter(Adgroup.frequency_cap_total == frequency_caps['total'])
        .filter(Adgroup.name == adgroup_name)
        .filter(Adgroup.explanation == explanation)
        .filter(Adgroup.check_inadjacency == check_inadjacency)
        .filter(Adgroup.channel_id == channel_id)
        .join(Adgroup.tiles)
        .order_by(asc(Tile.id))
    )

    if results:
        for tile_id, adgroup_id in results:
            # now check frecent sites and adgroup categories for this tile
            db_frecents = get_frecent_sites_for_tile(session, tile_id)
            db_categories = get_categories_for_adgroup(session, adgroup_id)
            if db_frecents == sorted(set(frecent_sites)) and db_categories == sorted(set(adgroup_categories)):
                return tile_id, adgroup_id

    return None, None


def insert_tile(session, target_url, bg_color, title, typ, image_uri, enhanced_image_uri, locale,
                frecent_sites, time_limits, frequency_caps, adgroup_name, adgroup_categories,
                explanation, check_inadjacency, channel_id, title_bg_color, *args, **kwargs):
    now = datetime.utcnow()

    adgroup = Adgroup(
        locale=locale,
        start_date=time_limits.get('start'),
        end_date=time_limits.get('end'),
        start_date_dt=time_limits.get('start_dt'),
        end_date_dt=time_limits.get('end_dt'),
        name=adgroup_name,
        explanation=explanation,
        frequency_cap_daily=frequency_caps['daily'],
        frequency_cap_total=frequency_caps['total'],
        check_inadjacency=check_inadjacency,
        channel_id=channel_id,
        created_at=now
    )
    session.add(adgroup)
    session.flush()
    ag_id = adgroup.id

    if frecent_sites:
        sites = (AdgroupSite(adgroup_id=ag_id, site=site, created_at=now) for site in frecent_sites)
        session.bulk_save_objects(sites)

    if adgroup_categories:
        categories = (AdgroupCategory(adgroup_id=ag_id, category=category) for category in adgroup_categories)
        session.bulk_save_objects(categories)

    tile = Tile(
        target_url=target_url,
        bg_color=bg_color,
        title_bg_color=title_bg_color,
        title=title,
        type=typ,
        image_uri=image_uri,
        enhanced_image_uri=enhanced_image_uri,
        created_at=now,
        locale=locale,
        adgroup_id=ag_id
    )
    session.add(tile)
    session.flush()
    tile_id = tile.id

    return tile_id, ag_id


def insert_distribution(url, channel_id, deployed, scheduled_dt, *args, **kwargs):
    from splice.environment import Environment

    # ensure that on insert, a distribution is either deployed or scheduled, not both
    if scheduled_dt is not None:
        deployed = False

    env = Environment.instance()
    conn = env.db.engine.connect()
    trans = conn.begin()
    try:
        conn.execute(
            text(
                "INSERT INTO distributions ("
                " url, channel_id, deployed, scheduled_start_date, created_at"
                ") "
                "VALUES ("
                " :url, :channel_id, :deployed, :scheduled_start_date, :created_at"
                ")"
            ),
            url=url,
            channel_id=channel_id,
            deployed=deployed,
            scheduled_start_date=scheduled_dt,
            created_at=datetime.utcnow()
        )
        trans.commit()
    except:
        trans.rollback()
        raise


def get_all_distributions(limit=100):
    """
    Obtain distributions, partitioned by channels with up to ``limit`` results
    for each channel
    """
    from splice.environment import Environment

    env = Environment.instance()

    dist_cte = (
        env.db.session
        .query(
            Distribution.channel_id,
            Distribution.url,
            Distribution.created_at,
            func.row_number().over(
                partition_by=Distribution.channel_id,
                order_by=Distribution.created_at.desc())
            .label('row_num')
        )
    ).cte()

    stmt = (
        env.db.session
        .query(
            dist_cte.c.channel_id,
            dist_cte.c.url,
            dist_cte.c.created_at)
        .filter(dist_cte.c.row_num <= limit)
        .order_by(dist_cte.c.created_at.desc())
    )

    rows = stmt.all()

    channels = {}

    for row in rows:
        c_dists = channels.setdefault(row.channel_id, [])
        c_dists.append({'url': row.url, 'created_at': row.created_at})

    return channels


def get_upcoming_distributions(limit=100, leniency_minutes=15, include_past=False):
    """
    Obtain distributions, partitioned by channels with up to ``limit`` results
    for each channel
    :leniency_minutes: have a leniency in minutes up to the present when looking for distributions
    :include_past: always return all past distributions
    """
    from splice.environment import Environment

    env = Environment.instance()

    # getting around PEP8 E712 warning. This is necessary for SQLAlchemy
    false_value = False

    dist_cte = (
        env.db.session
        .query(
            Distribution.id,
            Distribution.channel_id,
            Distribution.url,
            Distribution.created_at,
            Distribution.scheduled_start_date,
            func.row_number().over(
                partition_by=Distribution.channel_id,
                order_by=Distribution.scheduled_start_date.asc())
            .label('row_num')
        )
        .filter(Distribution.deployed == false_value))

    if not include_past:
        min_dt = datetime.utcnow() - timedelta(minutes=leniency_minutes)
        dist_cte = (
            dist_cte
            .filter(Distribution.scheduled_start_date >= min_dt))

    dist_cte = dist_cte.cte()

    stmt = (
        env.db.session
        .query(
            dist_cte.c.id,
            dist_cte.c.channel_id,
            dist_cte.c.url,
            dist_cte.c.created_at,
            dist_cte.c.scheduled_start_date)
        .filter(dist_cte.c.row_num <= limit)
        .order_by(dist_cte.c.scheduled_start_date.asc())
    )

    rows = stmt.all()

    channels = {}

    for row in rows:
        c_dists = channels.setdefault(row.channel_id, [])
        c_dists.append({'id': row.id, 'url': row.url, 'created_at': row.created_at, 'scheduled_at': row.scheduled_start_date})

    return channels


def get_scheduled_distributions(minutes, dt_query=None):
    """
    Returns distributions scheduled from a point in time, and a leniency period
    within which a tasks could've been scheduled closed to that point.
    As a regular task, it is intended to run at least once hourly.
    :minutes: amount of time in the past from the query time which is still viable
    :dt_query: optionally set the date time to find schedules for
    """
    from splice.environment import Environment

    env = Environment.instance()

    if not minutes or not (0 < minutes < 60):
        raise ValueError("minutes needs to be a number between 1..59 inclusive")

    if dt_query is None:
        dt_query = datetime.utcnow()

    # getting around PEP8 E712 warning. This is necessary for SQLAlchemy
    false_value = False

    min_query_dt = dt_query - timedelta(minutes=minutes)

    stmt = (
        env.db.session
        .query(Distribution)
        .filter(Distribution.deployed == false_value)
        .filter(Distribution.scheduled_start_date.between(min_query_dt, dt_query))
    )

    dists = stmt.all()

    return dists


def unschedule_distribution(dist_id):
    """
    Remove a distribution id if it is scheduled but not deployed yet
    """
    from splice.environment import Environment

    env = Environment.instance()

    # getting around PEP8 E711 warning. This is necessary for SQLAlchemy
    none_value = None

    stmt = (
        env.db.session
        .query(Distribution)
        .filter(Distribution.id == dist_id)
        .filter(Distribution.scheduled_start_date != none_value)
    )

    dist = stmt.one()
    dist.scheduled_start_date = None
    env.db.session.commit()


def get_channels(limit=100):
    from splice.environment import Environment

    env = Environment.instance()

    rows = (
        env.db.session
        .query(Channel.id, Channel.name, Channel.created_at)
        .order_by(Channel.id.asc())
        .limit(limit)
        .all()
    )

    # ensure items are a list of dicts
    # KeyedTuples may serialize differently on other systems
    output = [d._asdict() for d in rows]

    return output
