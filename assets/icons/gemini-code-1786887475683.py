from PIL import Image, ImageFilter

def create_white_outline(input_path, output_path):
    # Load the image
    img = Image.open(input_path).convert("RGBA")
    
    # Extract the alpha channel (the transparency mask)
    alpha = img.split()[-1]
    
    # Detect the edges of the shape
    edges = alpha.filter(ImageFilter.FIND_EDGES)
    
    # Create a completely transparent new image
    outline_img = Image.new("RGBA", img.size, (0, 0, 0, 0))
    
    # Create a pure white layer
    white_layer = Image.new("RGBA", img.size, (255, 255, 255, 255))
    
    # Paste the white layer using the edges as a mask
    outline_img.paste(white_layer, mask=edges)
    
    # Save the new dark mode icon
    outline_img.save(output_path)
    print(f"Outline saved to {output_path}")

# Run the function
create_white_outline("icon48.png", "icon48_dark_mode.png")