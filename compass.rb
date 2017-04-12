project_path = File.expand_path(File.join(File.dirname(__FILE__), './src/assets'))
add_import_path "#{project_path}"
add_import_path "#{project_path}/styles"

sass_dir = %w(
	"#{project_path}"
	"#{project_path}/styles"
)