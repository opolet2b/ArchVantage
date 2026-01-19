from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.smart_template import SmartAnalysisTemplate
from app.core.init_db import run_migrations

def seed_default_templates(db: Session):
    templates = [
        {
            "name": "SWOT Analysis",
            "category_name": "Strategic Analysis",
            "activity_type": "Strategy",
            "description": "Evaluate Strengths, Weaknesses, Opportunities, and Threats.",
            "steps_count": 4,
            "pipeline_config": {
                "steps": [
                    {"id": "extractor", "type": "smart_extractor"},
                    {"id": "analyzer", "type": "deep_analyzer"},
                    {"id": "formatter", "type": "text_formatter"},
                    {"id": "visualizer", "type": "visualizer"}
                ],
                "edges": [
                    {"source": "extractor", "target": "analyzer"},
                    {"source": "analyzer", "target": "formatter"},
                    {"source": "formatter", "target": "visualizer"}
                ]
            }
        },
        {
            "name": "PESTLE Analysis",
            "category_name": "Strategic Analysis",
            "activity_type": "Strategy",
            "description": "Analyze Political, Economic, Social, Technological, Legal, and Environmental factors.",
            "steps_count": 4,
            "pipeline_config": {
                "steps": [
                    {"id": "extractor", "type": "smart_extractor"},
                    {"id": "analyzer", "type": "deep_analyzer"},
                    {"id": "formatter", "type": "text_formatter"},
                    {"id": "visualizer", "type": "visualizer"}
                ],
                "edges": [
                    {"source": "extractor", "target": "analyzer"},
                    {"source": "analyzer", "target": "formatter"},
                    {"source": "formatter", "target": "visualizer"}
                ]
            }
        },
        {
            "name": "5 Whys",
            "category_name": "Root Cause Analysis",
            "activity_type": "Problem Solving",
            "description": "Iterative interrogative technique used to explore the cause-and-effect relationships underlying a particular problem.",
            "steps_count": 3,
            "pipeline_config": {
                "steps": [
                    {"id": "extractor", "type": "smart_extractor"},
                    {"id": "analyzer", "type": "recursive_analyzer"},
                    {"id": "formatter", "type": "text_formatter"}
                ],
                "edges": [
                    {"source": "extractor", "target": "analyzer"},
                    {"source": "analyzer", "target": "formatter"}
                ]
            }
        },
        {
             "name": "Deep Web Research",
             "category_name": "Research",
             "activity_type": "Investigation",
             "description": "Extract data and perform deep web research to augment findings.",
             "steps_count": 4,
             "pipeline_config": {
                 "steps": [
                     {"id": "extractor", "type": "smart_extractor"},
                     {"id": "researcher", "type": "web_researcher"},
                     {"id": "synthesizer", "type": "text_synthesizer"},
                     {"id": "formatter", "type": "markdown_formatter"}
                 ],
                 "edges": [
                     {"source": "extractor", "target": "researcher"},
                     {"source": "researcher", "target": "synthesizer"},
                     {"source": "synthesizer", "target": "formatter"}
                 ]
             }
        }
    ]

    print(f"Seeding {len(templates)} default templates...")
    for t_data in templates:
        existing = db.query(SmartAnalysisTemplate).filter(SmartAnalysisTemplate.name == t_data["name"]).first()
        if not existing:
            template = SmartAnalysisTemplate(**t_data)
            db.add(template)
            print(f"Created template: {template.name}")
        else:
            print(f"Skipped existing template: {t_data['name']}")
    
    db.commit()

if __name__ == "__main__":
    db = SessionLocal()
    # Ensure schema is up to date first
    run_migrations(db)
    seed_default_templates(db)
    db.close()
