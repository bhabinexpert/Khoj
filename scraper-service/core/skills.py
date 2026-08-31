"""Skill extraction for job postings.

Deliberately keyword-driven and dependency-free so the scraper stays light.
The richer taxonomy used for CV parsing lives in the ml-service
(``app/parsers/skills_dictionary.py``); in a monorepo with a shared package
these two would collapse into one module. See the README's "Known
limitations" section.
"""

from __future__ import annotations

import re
from typing import Iterable

# Canonical display name -> surface forms that should map onto it.
SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "Python": ("python", "python3"),
    "JavaScript": ("javascript", "java script", "js", "es6"),
    "TypeScript": ("typescript", "ts"),
    "React": ("react", "reactjs", "react.js", "react js"),
    "Next.js": ("next.js", "nextjs"),
    "Vue.js": ("vue", "vuejs", "vue.js"),
    "Angular": ("angular", "angularjs"),
    "Node.js": ("node", "nodejs", "node.js"),
    "Express.js": ("express", "expressjs", "express.js"),
    "Django": ("django",),
    "Flask": ("flask",),
    "FastAPI": ("fastapi", "fast api"),
    "Laravel": ("laravel",),
    "PHP": ("php",),
    "Java": ("java", "core java"),
    "Spring Boot": ("spring boot", "springboot", "spring"),
    "Kotlin": ("kotlin",),
    "Swift": ("swift",),
    "Flutter": ("flutter",),
    "React Native": ("react native",),
    "C#": ("c#", "c sharp", "csharp"),
    ".NET": (".net", "dotnet", "asp.net"),
    "C++": ("c++", "cpp"),
    "Go": ("golang", "go lang"),
    "Rust": ("rust",),
    "Ruby on Rails": ("ruby on rails", "rails"),
    "HTML": ("html", "html5"),
    "CSS": ("css", "css3"),
    "Tailwind CSS": ("tailwind", "tailwindcss", "tailwind css"),
    "Bootstrap": ("bootstrap",),
    "SQL": ("sql", "t-sql", "pl/sql"),
    "MySQL": ("mysql", "mariadb"),
    "PostgreSQL": ("postgresql", "postgres"),
    "MongoDB": ("mongodb", "mongo"),
    "Redis": ("redis",),
    "Elasticsearch": ("elasticsearch", "elastic search"),
    "GraphQL": ("graphql",),
    "REST API": ("rest api", "restful", "rest apis", "api development"),
    "Git": ("git", "github", "gitlab", "version control"),
    "Docker": ("docker", "containerization"),
    "Kubernetes": ("kubernetes", "k8s"),
    "AWS": ("aws", "amazon web services", "ec2", "s3 bucket"),
    "Azure": ("azure", "microsoft azure"),
    "Google Cloud": ("gcp", "google cloud"),
    "CI/CD": ("ci/cd", "continuous integration", "jenkins", "github actions"),
    "Linux": ("linux", "ubuntu", "centos", "bash scripting"),
    "Nginx": ("nginx",),
    "Terraform": ("terraform",),
    "Machine Learning": ("machine learning", "ml models", "deep learning"),
    "Data Analysis": ("data analysis", "data analytics", "data analyst"),
    "Pandas": ("pandas",),
    "NumPy": ("numpy",),
    "TensorFlow": ("tensorflow",),
    "PyTorch": ("pytorch",),
    "Power BI": ("power bi", "powerbi"),
    "Tableau": ("tableau",),
    "Excel": ("excel", "ms excel", "microsoft excel", "spreadsheet"),
    "Digital Marketing": ("digital marketing", "seo", "sem", "google ads", "social media marketing"),
    "Content Writing": ("content writing", "copywriting", "content creation", "blog writing"),
    "Graphic Design": ("graphic design", "photoshop", "illustrator", "canva"),
    "UI/UX Design": ("ui/ux", "ux design", "ui design", "figma", "adobe xd", "wireframing"),
    "Video Editing": ("video editing", "premiere pro", "after effects"),
    "Accounting": ("accounting", "bookkeeping", "tally", "vat filing"),
    "Financial Analysis": ("financial analysis", "financial modeling", "budgeting"),
    "Sales": ("sales", "business development", "lead generation"),
    "Customer Service": ("customer service", "customer support", "client servicing"),
    "Human Resources": ("human resource", "hr operations", "recruitment", "talent acquisition"),
    "Project Management": ("project management", "agile", "scrum", "jira"),
    "Communication": ("communication skills", "verbal communication", "interpersonal skills"),
    "Teamwork": ("teamwork", "team player", "collaboration"),
    "Problem Solving": ("problem solving", "analytical skills", "critical thinking"),
    "Leadership": ("leadership", "team management", "mentoring"),
    "English": ("english proficiency", "fluent english", "english language"),
    "Nepali": ("nepali language", "nepali typing"),
    "Teaching": ("teaching", "tutoring", "lesson planning"),
    "Nursing": ("nursing", "patient care"),
    "Civil Engineering": ("autocad", "civil engineering", "site supervision"),
    "Quality Assurance": ("quality assurance", "qa testing", "manual testing", "automation testing", "selenium"),
}

# Phrases that flag a "nice to have" block in Nepali job posts.
_PREFERRED_MARKERS = (
    "preferred",
    "nice to have",
    "good to have",
    "plus point",
    "added advantage",
    "advantageous",
    "bonus",
    "desirable",
    "will be a plus",
)

_ALIAS_LOOKUP: list[tuple[str, re.Pattern[str]]] = [
    (canonical, re.compile(r"(?<![a-z0-9+#.])" + re.escape(alias) + r"(?![a-z0-9+#])", re.I))
    for canonical, aliases in SKILL_ALIASES.items()
    for alias in aliases
]


def extract_skills(text: str) -> list[str]:
    """Return canonical skill names mentioned anywhere in ``text``."""
    if not text:
        return []
    found: list[str] = []
    for canonical, pattern in _ALIAS_LOOKUP:
        if canonical in found:
            continue
        if pattern.search(text):
            found.append(canonical)
    return found


def _split_preferred(text: str) -> tuple[str, str]:
    """Split a posting into (required-ish text, preferred-ish text)."""
    lowered = text.lower()
    cut = min(
        (lowered.find(marker) for marker in _PREFERRED_MARKERS if marker in lowered),
        default=-1,
    )
    if cut == -1:
        return text, ""
    return text[:cut], text[cut:]


def extract_required_skills(text: str) -> list[str]:
    required_text, _ = _split_preferred(text or "")
    return extract_skills(required_text)


def extract_preferred_skills(text: str) -> list[str]:
    required_text, preferred_text = _split_preferred(text or "")
    if not preferred_text:
        return []
    required = {s.lower() for s in extract_skills(required_text)}
    return [s for s in extract_skills(preferred_text) if s.lower() not in required]


def canonicalise(values: Iterable[str]) -> list[str]:
    """Map arbitrary skill strings onto canonical names where recognised."""
    out: list[str] = []
    for value in values or []:
        matches = extract_skills(value)
        for match in matches or [str(value).strip()]:
            if match and match not in out:
                out.append(match)
    return out
