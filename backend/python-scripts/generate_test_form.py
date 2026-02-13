import cv2
import numpy as np
import json
import os

def generate_synthetic_form(config_path, output_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    template = config['templates']['YKS_STANDARD']
    
    # Create a blank white A4-ish canvas (2500x3500)
    height, width = 3500, 2500
    image = np.ones((height, width, 3), dtype=np.uint8) * 255
    
    # Draw a thin border around the entire form to help Strategy 2 (outline detection)
    cv2.rectangle(image, (10, 10), (width-10, height-10), (0, 0, 0), 2)
    
    # Draw alignment markers (black squares at corners)
    # Increased size for better detection
    markers = template['alignment_markers']['positions']
    for m in markers:
        cv2.rectangle(image, (m['x']-40, m['y']-40), (m['x']+40, m['y']+40), (0, 0, 0), -1)
    
    # Draw Student Number region
    sn = template['regions']['student_number']
    grid = sn['grid']
    
    # Example Student Number: 12345678
    target_number = "12345678"
    
    # Calculate offset based on top-left marker
    offset_x = markers[0]['x']
    offset_y = markers[0]['y']
    
    for col in range(grid['columns']):
        digit_to_fill = int(target_number[col]) if col < len(target_number) else -1
        for row in range(grid['rows']):
            cx = sn['x'] + col * grid['col_spacing'] + grid['bubble_radius'] + offset_x
            cy = sn['y'] + row * grid['row_spacing'] + grid['bubble_radius'] + offset_y
            
            # Draw bubble outline
            cv2.circle(image, (int(cx), int(cy)), grid['bubble_radius'], (0, 0, 0), 2)
            
            # Fill if it's our digit
            if row == digit_to_fill:
                cv2.circle(image, (int(cx), int(cy)), grid['bubble_radius'] - 2, (0, 0, 0), -1)

    # Draw Answers region (Example: All 'A' for simplicity)
    ans_region = template['regions']['answers']
    for section in ans_region['sections']:
        grid = section['grid']
        for row in range(section['question_count']):
            for col in range(grid['columns']):
                cx = section['x'] + col * grid['col_spacing'] + grid['bubble_radius'] + offset_x
                cy = section['y'] + row * grid['row_spacing'] + grid['bubble_radius'] + offset_y
                
                # Draw bubble
                cv2.circle(image, (int(cx), int(cy)), grid['bubble_radius'], (0, 0, 0), 1)
                
                # Fill first column ('A')
                if col == 0:
                    cv2.circle(image, (int(cx), int(cy)), grid['bubble_radius'] - 2, (0, 0, 0), -1)

    cv2.imwrite(output_path, image)
    print(f"Synthetic form created: {output_path}")

if __name__ == "__main__":
    config_p = "omr_config.json"
    output_p = "test-image.jpg"
    generate_synthetic_form(config_p, output_p)
