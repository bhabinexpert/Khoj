"""Canonical skill taxonomy for CV parsing and match scoring.

Two things live here:

* :data:`SKILL_ALIASES` — canonical name -> surface forms. This is what makes
  "ReactJS", "React.js" and "react" all resolve to ``React`` *without* needing
  the embedding model, and it is also the vocabulary the keyword parser scans
  a CV for.
* :data:`SECTION_HEADINGS` — the heading words that mark CV sections.

Designed to be replaced, not extended forever: see
``app/parsers/base.py`` for the interface a spaCy NER parser would implement.
"""

from __future__ import annotations

import re
from typing import Iterable

SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    # ---------------------------------------------------------- languages
    "Python": ("python", "python3", "py"),
    "JavaScript": ("javascript", "java script", "js", "es6", "ecmascript", "vanilla js"),
    "TypeScript": ("typescript", "ts"),
    "Java": ("java", "core java", "java se", "j2ee"),
    "C": ("c programming", "c language"),
    "C++": ("c++", "cpp", "c plus plus"),
    "C#": ("c#", "csharp", "c sharp"),
    "PHP": ("php", "php7", "php8"),
    "Go": ("golang", "go lang"),
    "Rust": ("rust", "rust lang"),
    "Ruby": ("ruby",),
    "Kotlin": ("kotlin",),
    "Swift": ("swift", "swiftui"),
    "Dart": ("dart",),
    "R": ("r programming", "r language"),
    "Scala": ("scala",),
    "Shell Scripting": ("bash", "shell scripting", "shell script", "zsh", "powershell"),
    # ---------------------------------------------------------- frontend
    "HTML": ("html", "html5", "hypertext markup"),
    "CSS": ("css", "css3", "cascading style"),
    "Sass": ("sass", "scss"),
    "React": ("react", "reactjs", "react.js", "react js"),
    "Next.js": ("next.js", "nextjs", "next js"),
    "Vue.js": ("vue", "vuejs", "vue.js", "vue 3", "nuxt", "nuxt.js"),
    "Angular": ("angular", "angularjs", "angular 2"),
    "Svelte": ("svelte", "sveltekit"),
    "Redux": ("redux", "redux toolkit", "rtk query"),
    "Tailwind CSS": ("tailwind", "tailwindcss", "tailwind css"),
    "Bootstrap": ("bootstrap", "bootstrap 5"),
    "jQuery": ("jquery",),
    "Webpack": ("webpack",),
    "Vite": ("vite", "vitejs"),
    "React Native": ("react native", "react-native"),
    "Flutter": ("flutter",),
    # ---------------------------------------------------------- backend
    "Node.js": ("node", "nodejs", "node.js", "node js"),
    "Express.js": ("express", "expressjs", "express.js"),
    "NestJS": ("nestjs", "nest.js"),
    "Django": ("django", "django rest framework", "drf"),
    "Flask": ("flask",),
    "FastAPI": ("fastapi", "fast api"),
    "Laravel": ("laravel",),
    "CodeIgniter": ("codeigniter", "code igniter"),
    "Spring Boot": ("spring boot", "springboot", "spring framework", "spring"),
    ".NET": (".net", "dotnet", "asp.net", "asp net", ".net core"),
    "Ruby on Rails": ("ruby on rails", "rails", "ror"),
    "GraphQL": ("graphql", "apollo server"),
    "REST API": ("rest api", "restful api", "rest apis", "restful", "api development", "api integration"),
    "gRPC": ("grpc",),
    "Microservices": ("microservices", "micro services", "microservice architecture"),
    "WebSockets": ("websocket", "websockets", "socket.io"),
    # ---------------------------------------------------------- data stores
    "SQL": ("sql", "t-sql", "pl/sql", "ansi sql"),
    "MySQL": ("mysql", "mariadb"),
    "PostgreSQL": ("postgresql", "postgres", "psql"),
    "MongoDB": ("mongodb", "mongo", "mongoose"),
    "Redis": ("redis",),
    "SQLite": ("sqlite",),
    "Oracle": ("oracle db", "oracle database", "oracle 11g"),
    "SQL Server": ("sql server", "mssql", "microsoft sql server"),
    "Elasticsearch": ("elasticsearch", "elastic search", "opensearch"),
    "Firebase": ("firebase", "firestore"),
    # ---------------------------------------------------------- devops/cloud
    "Git": ("git", "github", "gitlab", "bitbucket", "version control"),
    "Docker": ("docker", "containerization", "containerisation", "docker compose"),
    "Kubernetes": ("kubernetes", "k8s", "helm"),
    "AWS": ("aws", "amazon web services", "ec2", "s3", "lambda", "cloudformation"),
    "Azure": ("azure", "microsoft azure", "azure devops"),
    "Google Cloud": ("gcp", "google cloud", "google cloud platform"),
    "CI/CD": ("ci/cd", "cicd", "continuous integration", "continuous deployment", "jenkins", "github actions", "gitlab ci"),
    "Terraform": ("terraform", "infrastructure as code", "iac"),
    "Ansible": ("ansible",),
    "Linux": ("linux", "ubuntu", "centos", "rhel", "debian", "unix"),
    "Nginx": ("nginx",),
    "Apache": ("apache", "httpd", "apache2"),
    "Monitoring": ("prometheus", "grafana", "datadog", "monitoring", "observability"),
    # ---------------------------------------------------------- data / ML
    "Machine Learning": ("machine learning", "ml", "supervised learning", "predictive modeling"),
    "Deep Learning": ("deep learning", "neural networks", "cnn", "rnn", "transformers"),
    "NLP": ("nlp", "natural language processing", "text mining"),
    "Computer Vision": ("computer vision", "opencv", "image processing"),
    "TensorFlow": ("tensorflow", "keras"),
    "PyTorch": ("pytorch", "torch"),
    "scikit-learn": ("scikit-learn", "sklearn", "scikit learn"),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "Data Analysis": ("data analysis", "data analytics", "exploratory data analysis", "eda"),
    "Data Visualization": ("data visualization", "data visualisation", "matplotlib", "seaborn", "plotly"),
    "Power BI": ("power bi", "powerbi"),
    "Tableau": ("tableau",),
    "Excel": ("excel", "ms excel", "microsoft excel", "advanced excel", "pivot table", "vlookup"),
    "ETL": ("etl", "data pipeline", "data pipelines", "airflow", "dbt"),
    "Big Data": ("big data", "hadoop", "spark", "pyspark", "kafka"),
    "Statistics": ("statistics", "statistical analysis", "hypothesis testing", "regression analysis"),
    # ---------------------------------------------------------- QA / security
    "Quality Assurance": ("quality assurance", "qa", "software testing", "manual testing"),
    "Test Automation": ("test automation", "automation testing", "selenium", "cypress", "playwright", "pytest", "jest"),
    "Performance Testing": ("performance testing", "load testing", "jmeter", "k6"),
    "Cybersecurity": ("cyber security", "cybersecurity", "information security", "infosec"),
    "Penetration Testing": ("penetration testing", "pentesting", "ethical hacking", "vapt", "burp suite"),
    # ---------------------------------------------------------- design
    "UI/UX Design": ("ui/ux", "ux design", "ui design", "user experience", "user interface design", "wireframing", "prototyping"),
    "Figma": ("figma",),
    "Adobe XD": ("adobe xd", "xd"),
    "Photoshop": ("photoshop", "adobe photoshop", "ps"),
    "Illustrator": ("illustrator", "adobe illustrator"),
    "Graphic Design": ("graphic design", "graphics design", "visual design", "canva", "corel draw", "coreldraw"),
    "Video Editing": ("video editing", "premiere pro", "after effects", "final cut", "davinci resolve", "capcut"),
    "3D Modelling": ("3d modelling", "3d modeling", "blender", "3ds max", "maya"),
    "AutoCAD": ("autocad", "auto cad", "cad"),
    # ---------------------------------------------------------- business
    "Digital Marketing": ("digital marketing", "online marketing", "performance marketing"),
    "SEO": ("seo", "search engine optimization", "search engine optimisation", "on-page seo"),
    "SEM": ("sem", "google ads", "adwords", "ppc", "paid ads", "meta ads", "facebook ads"),
    "Social Media Marketing": ("social media marketing", "smm", "social media management"),
    "Content Writing": ("content writing", "copywriting", "content creation", "blog writing", "article writing"),
    "Email Marketing": ("email marketing", "mailchimp", "newsletter", "drip campaign"),
    "Google Analytics": ("google analytics", "ga4", "web analytics"),
    "Sales": ("sales", "b2b sales", "b2c sales", "inside sales", "field sales"),
    "Business Development": ("business development", "bd", "lead generation", "client acquisition"),
    "Customer Service": ("customer service", "customer support", "client servicing", "customer relationship", "crm"),
    "Accounting": ("accounting", "bookkeeping", "book keeping", "tally", "quickbooks", "journal entries"),
    "Taxation": ("taxation", "vat", "tds", "tax filing", "income tax"),
    "Financial Analysis": ("financial analysis", "financial modeling", "financial modelling", "budgeting", "forecasting", "valuation"),
    "Audit": ("audit", "auditing", "internal audit", "statutory audit"),
    "Human Resources": ("human resource", "human resources", "hr", "hr operations", "payroll"),
    "Recruitment": ("recruitment", "talent acquisition", "hiring", "sourcing candidates"),
    "Project Management": ("project management", "agile", "scrum", "kanban", "jira", "sprint planning", "pmp"),
    "Product Management": ("product management", "product owner", "roadmap", "user stories"),
    "Operations Management": ("operations management", "supply chain", "logistics", "inventory management", "procurement"),
    "Teaching": ("teaching", "tutoring", "lesson planning", "curriculum development", "lecturing"),
    # ---------------------------------------------------------- soft skills
    "Communication": ("communication", "communication skills", "verbal communication", "written communication", "presentation skills"),
    "Teamwork": ("teamwork", "team player", "collaboration", "cross-functional"),
    "Problem Solving": ("problem solving", "problem-solving", "analytical skills", "critical thinking", "troubleshooting"),
    "Leadership": ("leadership", "team leadership", "team management", "mentoring", "people management"),
    "Time Management": ("time management", "prioritization", "multitasking", "meeting deadlines"),
    "Adaptability": ("adaptability", "flexibility", "fast learner", "quick learner"),
    "Attention to Detail": ("attention to detail", "detail oriented", "detail-oriented", "meticulous"),
    # ---------------------------------------------------------- languages spoken
    "English": ("english", "fluent english", "english proficiency", "ielts"),
    "Nepali": ("nepali", "nepali typing", "nepali language"),
    "Hindi": ("hindi",),
    "Japanese": ("japanese", "jlpt", "nihongo"),
    "Korean": ("korean", "eps-topik", "topik"),
    # ---------------------------------------------------------- other trades
    "Nursing": ("nursing", "patient care", "staff nurse"),
    "Pharmacy": ("pharmacy", "pharmacist", "dispensing"),
    "Civil Engineering": ("civil engineering", "site supervision", "structural design", "estimation and costing"),
    "Electrical Engineering": ("electrical engineering", "wiring", "plc", "scada"),
    "Mechanical Engineering": ("mechanical engineering", "solidworks", "hvac"),
    "Driving": ("driving", "driving licence", "driving license"),
    "Cooking": ("cooking", "culinary", "chef", "food preparation"),
}

#: Reverse index: surface form -> canonical name (longest alias wins on ties).
ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canonical, _aliases in SKILL_ALIASES.items():
    ALIAS_TO_CANONICAL[_canonical.lower()] = _canonical
    for _alias in _aliases:
        ALIAS_TO_CANONICAL.setdefault(_alias.lower(), _canonical)

#: Aliases too short or too common to scan for in running prose. They still
#: resolve through :func:`canonical_skill`, i.e. when the CV lists them as an
#: explicit skills-section item ("Languages: Python, R, C"). Free-text scanning
#: would otherwise turn "R&D" into R, "8 hr shifts" into Human Resources and
#: "100 ml" into Machine Learning.
_SHORT_ALLOWED = {"c#", "c++", "js", "ts"}
#: Longer aliases that are still ambiguous in Nepali CVs: "5th sem", "Spring
#: 2023", the given name Maya, and Python's own ``lambda``.
_FREETEXT_DENY = {"sem", "spring", "maya", "lambda", "eda", "ps", "xd", "bd"}


def _scannable(alias: str) -> bool:
    if alias in _FREETEXT_DENY:
        return False
    return len(alias) >= 3 or alias in _SHORT_ALLOWED


#: Compiled matchers, longest-first so "react native" beats "react".
_SKILL_PATTERNS: list[tuple[str, re.Pattern[str]]] = sorted(
    (
        (canonical, re.compile(r"(?<![a-z0-9+#.])" + re.escape(alias) + r"(?![a-z0-9+#])", re.I))
        for canonical, aliases in SKILL_ALIASES.items()
        for alias in (canonical.lower(), *aliases)
        if _scannable(alias)
    ),
    key=lambda pair: -len(pair[1].pattern),
)

SECTION_HEADINGS: dict[str, tuple[str, ...]] = {
    "skills": (
        "skills", "technical skills", "core skills", "key skills", "core competencies",
        "competencies", "expertise", "areas of expertise", "technologies", "tech stack",
        "proficiencies", "skill set", "professional skills", "it skills",
    ),
    "education": (
        "education", "educational qualification", "educational qualifications", "academics",
        "academic background", "academic qualification", "qualifications", "education & training",
    ),
    "experience": (
        "experience", "work experience", "professional experience", "employment history",
        "employment", "work history", "career history", "internship", "internships",
        "professional background", "relevant experience",
    ),
    "certifications": (
        "certifications", "certification", "certificates", "licenses & certifications",
        "trainings", "training", "courses", "professional development", "awards & certifications",
    ),
    "projects": ("projects", "personal projects", "academic projects", "key projects"),
    "summary": ("summary", "profile", "objective", "career objective", "about me", "professional summary"),
    "languages": ("languages", "language proficiency", "languages known"),
    "references": ("references", "referees", "reference"),
}


def canonical_skill(value: str) -> str | None:
    """Resolve one skill string to its canonical name, if recognised."""
    key = re.sub(r"\s+", " ", str(value or "")).strip().lower()
    if not key:
        return None
    if key in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[key]
    # Trailing noise like "React (advanced)" or "Python - 3 years".
    stripped = re.split(r"[(\[\-–:]| {2,}", key)[0].strip()
    return ALIAS_TO_CANONICAL.get(stripped)


#: Stable ordering for output, so two runs on the same CV agree.
_CANONICAL_ORDER: dict[str, int] = {name: i for i, name in enumerate(SKILL_ALIASES)}


def find_skills(text: str) -> list[str]:
    """Canonical skills mentioned anywhere in ``text``, in taxonomy order."""
    if not text:
        return []
    seen: set[str] = set()
    for canonical, pattern in _SKILL_PATTERNS:
        if canonical in seen:
            continue
        if pattern.search(text):
            seen.add(canonical)
    return sorted(seen, key=lambda name: _CANONICAL_ORDER.get(name, 10_000))


def canonicalise_all(values: Iterable[str]) -> list[str]:
    """Map a list of raw skill strings onto canonical names, keeping unknowns."""
    out: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        raw = re.sub(r"\s+", " ", str(value or "")).strip()
        if not raw:
            continue
        name = canonical_skill(raw) or raw
        key = name.lower()
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out
